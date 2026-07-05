# Day 61 — outputs consumed by the app/orchestrator module + the deployment runbook.
output "vpc_id" {
  value = aws_vpc.this.id
}
output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}
output "database_endpoint" {
  value     = aws_db_instance.postgres.endpoint
  sensitive = true
}
output "redis_endpoint" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}
output "storage_bucket" {
  value = aws_s3_bucket.storage.bucket
}
output "data_region" {
  value = var.data_region
}
output "zero_egress" {
  value = !var.enable_public_egress
}
