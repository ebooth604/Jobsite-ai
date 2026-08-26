variable "name_prefix" {
  description = "Prefix every resource name is built from, e.g. sitewireai-dev."
  type        = string
}

variable "database_name" {
  description = "Logical database created inside the cluster."
  type        = string
  default     = "sitewire"
}

variable "engine_version" {
  description = "Aurora PostgreSQL engine version. Must support Serverless v2 and the Data API."
  type        = string
  default     = "16.6"
}

variable "max_capacity" {
  description = "Ceiling in Aurora Capacity Units. 1 ACU is ample for a demo; this is a cost guard."
  type        = number
  default     = 2
}
