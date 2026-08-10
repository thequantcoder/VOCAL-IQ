# Day 61 — Single-tenant VPC deployment for VocalIQ (isolated, region-pinned, zero-egress).
# Each enterprise tenant gets a dedicated VPC hosting api + voice + workers + Postgres + Redis +
# object storage — NO shared data plane. All resources are pinned to var.data_region so data
# never crosses regions (data residency). Egress is disabled by default (no NAT/IGW).

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.data_region
  default_tags {
    tags = {
      Project  = "vocaliq"
      Tenant   = var.tenant_slug
      Residency = var.data_region
      ManagedBy = "terraform"
    }
  }
}

locals {
  name = "vq-${var.tenant_slug}"
  azs  = ["${var.data_region}a", "${var.data_region}b"]
}

# ── Isolated network ──────────────────────────────────────────────────────────
resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  tags                 = { Name = "${local.name}-vpc" }
}

resource "aws_subnet" "private" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.this.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index)
  tags              = { Name = "${local.name}-private-${count.index}" }
}

# Optional egress — off by default so tenant data cannot leave the VPC (zero-egress residency).
resource "aws_internet_gateway" "this" {
  count  = var.enable_public_egress ? 1 : 0
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${local.name}-igw" }
}

# ── Data stores (region-pinned, single-tenant) ────────────────────────────────
resource "aws_db_subnet_group" "this" {
  name       = "${local.name}-db"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "postgres" {
  identifier             = "${local.name}-pg"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = var.db_instance_class
  allocated_storage      = 100
  storage_encrypted      = true
  db_subnet_group_name   = aws_db_subnet_group.this.name
  publicly_accessible    = false
  skip_final_snapshot    = false
  deletion_protection    = true
  # Data stays in-region: no cross-region read replicas by default.
}

resource "aws_elasticache_subnet_group" "this" {
  name       = "${local.name}-redis"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${local.name}-redis"
  engine               = "redis"
  node_type            = "cache.r6g.large"
  num_cache_nodes      = 1
  subnet_group_name    = aws_elasticache_subnet_group.this.name
}

resource "aws_s3_bucket" "storage" {
  bucket = "${local.name}-storage-${var.data_region}"
  tags   = { Name = "${local.name}-storage" }
}

resource "aws_s3_bucket_public_access_block" "storage" {
  bucket                  = aws_s3_bucket.storage.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# api / voice / workers run as containers (ECS/EKS/Nomad) in the private subnets — wired by the
# environment-specific module that consumes these outputs. Kept out of this base module so the
# same network + data plane can back any orchestrator.
