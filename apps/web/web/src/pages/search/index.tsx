// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Tìm kiếm toàn văn đề nghị mua sắm và nội dung tệp đính kèm (Action search_documents, ADR #36).
// Tenant và quyền xem lọc ở máy chủ; giao diện chỉ gửi chữ cần tìm. Từ khóa giữ trên URL (?q=).
import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Card, Empty, Input, List, Segmented, Space, Tag, Typography } from "antd";
import { DownloadOutlined, FileTextOutlined, PaperClipOutlined } from "@ant-design/icons";
import { Link, useSearchParams } from "react-router";
import { request } from "../../api/client";
import { StatusTag } from "../../components/StatusTag";
import { formatMoney } from "../../utils/format";

const PAGE = 20;
const DEBOUNCE_MS = 250;

const SEARCH = `
  query Search($q: String!, $kind: SearchKind, $limit: Int, $offset: Int) {
    search_documents(query: $q, kind: $kind, limit: $limit, offset: $offset) {
      kind entity_id attachment_id file_name matched_field snippet
      purchase_request { id doc_no title status total_amount requester { full_name } org_unit { name } }
    }
  }
`;

type Kind = "all" | "purchase_request" | "attachment";
type Hit = {
  kind: "purchase_request" | "attachment"; entity_id: string; attachment_id: string | null; file_name: string | null;
  matched_field: string | null; snippet: string;
  purchase_request: { id: string; doc_no: string; title: string; status: string; total_amount: number;
                      requester: { full_name: string } | null; org_unit: { name: string } | null } | null;
};

const FIELD: Record<string, string> = {
  doc_no: "Số chứng từ", title: "Tiêu đề", description: "Mô tả", items: "Dòng hàng", partner: "Nhà cung cấp",
  requester: "Người lập", org_unit: "Đơn vị", content: "Nội dung tệp", file_name: "Tên tệp",
};

export const SearchPage = () => {
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const kind = (params.get("kind") as Kind | null) ?? "all";
  const [text, setText] = useState(q);
  const [hits, setHits] = useState<Hit[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const seq = useRef(0);

  const update = (next: { q?: string; kind?: Kind }) => {
    const p = new URLSearchParams(params);
    const nq = next.q ?? q;
    const nk = next.kind ?? kind;
    if (nq) p.set("q", nq); else p.delete("q");
    if (nk !== "all") p.set("kind", nk); else p.delete("kind");
    setParams(p, { replace: true });
  };

  // Gõ tới đâu tìm tới đó, chờ 250 ms sau lần gõ cuối.
  useEffect(() => {
    if (text.trim() === q) return;
    const t = setTimeout(() => update({ q: text.trim() }), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const fetchPage = async (offset: number) => {
    const my = ++seq.current;
    setLoading(true);
    setError(undefined);
    try {
      const r = await request<{ search_documents: Hit[] }>(SEARCH, {
        q, kind: kind === "all" ? null : kind, limit: PAGE, offset,
      });
      if (my !== seq.current) return; // Đã có lần tìm mới hơn.
      setHits((old) => (offset === 0 ? r.search_documents : [...old, ...r.search_documents]));
      setMore(r.search_documents.length === PAGE);
    } catch (e) {
      if (my === seq.current) setError((e as Error).message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!q) {
      seq.current++;
      setHits([]);
      setMore(false);
      setError(undefined);
      setLoading(false);
      return;
    }
    void fetchPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, kind]);

  const download = async (attachmentId: string) => {
    try {
      const { get_download_url } = await request<{ get_download_url: { url: string } }>(
        `query Dl($a: uuid!) { get_download_url(attachment_id: $a) { url } }`, { a: attachmentId });
      window.open(get_download_url.url, "_blank", "noopener");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Card title="Tìm kiếm">
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Input.Search size="large" allowClear autoFocus enterButton value={text} loading={loading}
                      placeholder="Số chứng từ, tiêu đề, mặt hàng, nhà cung cấp, nội dung tệp… (gõ không dấu được)"
                      aria-label="Tìm kiếm"
                      onChange={(e) => setText(e.target.value)}
                      onSearch={(v) => { setText(v); update({ q: v.trim() }); }} />
        <Segmented<Kind> value={kind} onChange={(v) => update({ kind: v })} options={[
          { label: "Tất cả", value: "all" },
          { label: "Đề nghị mua sắm", value: "purchase_request" },
          { label: "Tệp đính kèm", value: "attachment" },
        ]} />
        {error && <Alert type="error" showIcon message={error} />}
        {!q ? (
          <Empty description="Nhập từ khóa để tìm trong các đề nghị và tệp đính kèm bạn được xem." />
        ) : (
          <List<Hit>
            loading={loading && hits.length === 0}
            dataSource={hits}
            locale={{ emptyText: <Empty description={`Không tìm thấy kết quả cho “${q}”.`} /> }}
            rowKey={(h) => `${h.kind}:${h.attachment_id ?? h.entity_id}`}
            loadMore={more && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <Button loading={loading} onClick={() => fetchPage(hits.length)}>Xem thêm</Button>
              </div>
            )}
            renderItem={(h) => {
              const pr = h.purchase_request;
              return (
                <List.Item
                  actions={h.attachment_id ? [
                    <Button key="dl" size="small" icon={<DownloadOutlined />} onClick={() => download(h.attachment_id!)}>Tải tệp</Button>,
                  ] : undefined}
                >
                  <List.Item.Meta
                    avatar={h.kind === "attachment" ? <PaperClipOutlined /> : <FileTextOutlined />}
                    title={(
                      <Space wrap>
                        <Link to={`/p/documents/show/${h.entity_id}`}>
                          {pr && <Typography.Text code>{pr.doc_no}</Typography.Text>} {pr?.title ?? h.entity_id}
                        </Link>
                        {pr && <StatusTag status={pr.status} />}
                        {h.file_name && <Tag icon={<PaperClipOutlined />}>{h.file_name}</Tag>}
                      </Space>
                    )}
                    description={(
                      <Space direction="vertical" size={2}>
                        {/* Máy chủ đã escape HTML, chỉ thêm thẻ <mark> quanh chữ khớp (ADR #36). */}
                        <span className="bamboo-snippet" dangerouslySetInnerHTML={{ __html: h.snippet }} />
                        <Typography.Text type="secondary">
                          {h.matched_field ? `Khớp ở: ${FIELD[h.matched_field] ?? h.matched_field}` : ""}
                          {pr ? ` · ${pr.requester?.full_name ?? ""} · ${pr.org_unit?.name ?? ""} · ${formatMoney(pr.total_amount)}` : ""}
                        </Typography.Text>
                      </Space>
                    )}
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Space>
    </Card>
  );
};
