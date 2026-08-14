import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, Tooltip, message } from 'antd'
import { CloudServerOutlined, ReloadOutlined } from '@ant-design/icons'
import { getDockerContainers, importDockerContainers } from '../api'

type DockerRow = {
  id: string
  name: string
  image: string
  state: string
  status: string
  ports: string[]
  url: string
  icon_url?: string
  description?: string
  private?: boolean
  enabled?: boolean
  exists?: boolean
  suggested?: boolean
}

type Category = { id: number; name: string }

export default function DockerImportModal({
  open,
  categories,
  onClose,
  onSuccess,
}: {
  open: boolean
  categories: Category[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [list, setList] = useState<DockerRow[]>([])
  const [hint, setHint] = useState('')
  const [publicHost, setPublicHost] = useState('')
  const [error, setError] = useState('')
  const [onlyLabeled, setOnlyLabeled] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [asPrivate, setAsPrivate] = useState(false)
  const [edits, setEdits] = useState<Record<string, { name?: string; url?: string }>>({})

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res: any = await getDockerContainers({
        only_labeled: onlyLabeled,
        all: showAll,
      })
      setList(res.data?.list || [])
      setHint(res.data?.label_hint || '')
      setPublicHost(res.data?.public_host || '')
      const defaults = (res.data?.list || [])
        .filter((r: DockerRow) => r.suggested)
        .map((r: DockerRow) => r.id)
      setSelected(defaults)
    } catch (e) {
      setList([])
      setSelected([])
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setCategoryId(undefined)
    setAsPrivate(false)
    setEdits({})
    void load()
  }, [open, onlyLabeled, showAll])

  const rows = useMemo(
    () =>
      list.map((r) => ({
        ...r,
        name: edits[r.id]?.name ?? r.name,
        url: edits[r.id]?.url ?? r.url,
      })),
    [list, edits],
  )

  const onImport = async () => {
    if (!categoryId) {
      message.warning('请选择目标分类')
      return
    }
    const items = rows
      .filter((r) => selected.includes(r.id))
      .map((r) => ({
        name: r.name,
        url: r.url,
        description: r.description,
        icon_url: r.icon_url,
        private: r.private,
      }))
      .filter((r) => r.name && r.url)
    if (!items.length) {
      message.warning('请勾选至少一个可导入容器（需有访问 URL）')
      return
    }
    setImporting(true)
    try {
      const res: any = await importDockerContainers({
        category_id: categoryId,
        private: asPrivate,
        items,
      })
      message.success(res.data?.message || '导入完成')
      onSuccess()
      onClose()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      className="admin-modal"
      title={
        <div>
          <div>
            <CloudServerOutlined style={{ marginRight: 8 }} />
            从 Docker 添加容器链接
          </div>
          <div className="admin-modal-subtitle">
            扫描宿主机容器，一键写入链接列表
            {publicHost ? ` · 公网主机 ${publicHost}` : ''}
          </div>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={920}
      centered
      destroyOnHidden
      okText={`导入选中（${selected.length}）`}
      confirmLoading={importing}
      onOk={() => void onImport()}
      okButtonProps={{ disabled: !selected.length }}
    >
      {error ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={error}
          description="NAS/Compose 请挂载 /var/run/docker.sock，并设置 ONENAV_DOCKER_PUBLIC_HOST 为 NAS 的局域网 IP 或域名。"
        />
      ) : null}

      <div className="docker-import-toolbar">
        <Space wrap>
          <span className="docker-import-switch">
            仅标签 <Switch size="small" checked={onlyLabeled} onChange={setOnlyLabeled} />
          </span>
          <span className="docker-import-switch">
            含已停止 <Switch size="small" checked={showAll} onChange={setShowAll} />
          </span>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} style={{ borderRadius: 6 }}>
            刷新
          </Button>
        </Space>
        <Form layout="inline" className="admin-form docker-import-form">
          <Form.Item label="目标分类" required style={{ marginBottom: 0 }}>
            <Select
              style={{ width: 180 }}
              placeholder="选择分类"
              value={categoryId}
              onChange={setCategoryId}
              options={categories.map((c) => ({ label: c.name, value: c.id }))}
            />
          </Form.Item>
          <Form.Item label="默认私有" style={{ marginBottom: 0 }}>
            <Switch checked={asPrivate} onChange={setAsPrivate} />
          </Form.Item>
        </Form>
      </div>

      {hint ? (
        <div className="docker-import-hint">{hint}</div>
      ) : null}

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={false}
        scroll={{ y: 360 }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as string[]),
          getCheckboxProps: (row) => ({
            disabled: !row.url || !!row.exists,
          }),
        }}
        columns={[
          {
            title: '容器',
            dataIndex: 'name',
            width: 160,
            render: (v, row) => (
              <Input
                size="small"
                value={v}
                disabled={!!row.exists}
                onChange={(e) =>
                  setEdits((prev) => ({ ...prev, [row.id]: { ...prev[row.id], name: e.target.value } }))
                }
              />
            ),
          },
          {
            title: '状态',
            dataIndex: 'state',
            width: 88,
            render: (v, row) => (
              <Tooltip title={row.status}>
                <Tag color={v === 'running' ? 'success' : 'default'}>{v}</Tag>
              </Tooltip>
            ),
          },
          {
            title: '端口',
            dataIndex: 'ports',
            width: 120,
            render: (ports: string[]) => (ports?.length ? ports.join(', ') : '—'),
          },
          {
            title: '访问 URL',
            dataIndex: 'url',
            render: (v, row) => (
              <Input
                size="small"
                value={v}
                placeholder="无映射端口时可手动填写"
                disabled={!!row.exists}
                onChange={(e) =>
                  setEdits((prev) => ({ ...prev, [row.id]: { ...prev[row.id], url: e.target.value } }))
                }
              />
            ),
          },
          {
            title: '',
            width: 100,
            render: (_, row) => (
              <Space size={4}>
                {row.exists ? <Tag>已存在</Tag> : null}
                {row.enabled ? <Tag color="processing">标签</Tag> : null}
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  )
}
