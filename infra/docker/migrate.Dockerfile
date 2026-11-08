FROM postgres:17
LABEL org.opencontainers.image.title="bamboo-migrate" \
      org.opencontainers.image.description="Bamboo DX-OS: migration và kiểm thử CSDL (chạy một lần rồi thoát)" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY db /repo/db
COPY tools/db /repo/tools/db
ENTRYPOINT ["/repo/tools/db/up.sh"]
