# OpenBao lưu bền bằng integrated storage (raft) một node (ADR #25).
# Khởi tạo, unseal và cấu hình do job openbao-init (services/actions/app/openbao_init.py).
ui            = true
disable_mlock = true

storage "raft" {
  path    = "/openbao/file"   # entrypoint của image chown thư mục này cho user openbao
  node_id = "bao-1"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true   # dev: mạng nội bộ compose; triển khai thật bật TLS (cert-manager)
}

api_addr     = "http://openbao:8200"
cluster_addr = "http://openbao:8201"
