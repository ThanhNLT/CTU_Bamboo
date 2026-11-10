# SPDX-FileCopyrightText: 2026 Bamboo
#
# SPDX-License-Identifier: Apache-2.0

ui            = true
disable_mlock = true

storage "raft" {
  path    = "/openbao/file"
  node_id = "bao-1"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

api_addr     = "http://openbao:8200"
cluster_addr = "http://openbao:8201"
