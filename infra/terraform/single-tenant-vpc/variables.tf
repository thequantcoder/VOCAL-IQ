# Day 61 — Single-tenant VPC deployment: input variables.
# One isolated stack per enterprise tenant, pinned to one data region (zero cross-region egress).

variable "tenant_slug" {
  type        = string
  description = "Enterprise tenant identifier — namespaces every resource so deployments never collide."
}

variable "data_region" {
  type        = string
  description = "The single region this deployment is pinned to (must match a @vocaliq/shared DATA_REGIONS id)."
  default     = "us-east-1"
  validation {
    condition = contains([
      "us-east-1", "us-west-2", "eu-west-1", "eu-central-1",
      "uk-south-1", "ap-south-1", "ap-southeast-2", "ca-central-1"
    ], var.data_region)
    error_message = "data_region must be a supported VocalIQ data region."
  }
}

variable "vpc_cidr" {
  type        = string
  default     = "10.42.0.0/16"
  description = "Private CIDR for the isolated tenant VPC."
}

variable "db_instance_class" {
  type    = string
  default = "db.r6g.large"
}

variable "enable_public_egress" {
  type        = bool
  default     = false
  description = "Zero-egress by default: no NAT/IGW so tenant data cannot leave the VPC. Set true only if the tenant requires outbound provider calls from within their VPC."
}

variable "secrets_backend" {
  type        = string
  default     = "aws_secrets_manager"
  description = "Where app secrets (VAULT_MASTER_KEY, provider keys) are sourced from at boot."
}
