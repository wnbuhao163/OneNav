import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  createSearchEngine,
  deleteSearchEngine,
  getSearchEngines,
  updateSearchEngine,
} from '../../api'
import { SEARCH_GROUP_LABELS, type SearchEngineGroup } from '../../search/engines'

type EngineRow = {
  id: number
  engine_key: string
  key: string
  name: string
  group: SearchEngineGroup
  url: string
  enabled: boolean
  builtin: boolean
  sort: number
}

const GROUPS: SearchEngineGroup[] = ['web', 'content', 'pan']

export default function SearchEnginesPage() {
  const [list, setList] = useState<EngineRow[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<SearchEngineGroup>('web')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<EngineRow | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const res: any = await getSearchEngines()
      setList(res.data?.list || [])
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => list.filter((e) => e.group === tab), [list, tab])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      group: tab,
      enabled: true,
      sort: 500,
      url: 'https://example.com/search?q={q}',
    })
    setOpen(true)
  }

  const openEdit = (row: EngineRow) => {
    setEditing(row)
    form.setFieldsValue({
      name: row.name,
      group: row.group,
      url: row.url,
      enabled: row.enabled,
      sort: row.sort,
      key: row.engine_key || row.key,
    })
    setOpen(true)
  }

  const onSubmit = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      if (editing) {
        await updateSearchEngine(editing.id, {
          name: values.name,
          group: values.group,
          url: values.url,
          enabled: values.enabled,
          sort: values.sort,
        })
        message.success('已更新')
      } else {
        await createSearchEngine({
          key: values.key || undefined,
          name: values.name,
          group: values.group,
          url: values.url,
          enabled: values.enabled,
          sort: values.sort,
        })
        message.success('已添加')
      }
      setOpen(false)
      void load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const onToggle = async (row: EngineRow, enabled: boolean) => {
    try {
      await updateSearchEngine(row.id, { enabled })
      setList((prev) => prev.map((e) => (e.id === row.id ? { ...e, enabled } : e)))
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const onDelete = async (row: EngineRow) => {
    try {
      await deleteSearchEngine(row.id)
      message.success('已删除')
      void load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <div className="admin-shell-card">
      <div className="admin-page-header">
        <div>
          <h2>搜索引擎</h2>
          <p className="admin-page-desc">按分类管理前台搜索引擎，支持启用/禁用与自定义添加（URL 需含 {'{q}'}）</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ borderRadius: 6 }}>
          添加引擎
        </Button>
      </div>

      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as SearchEngineGroup)}
        items={GROUPS.map((g) => ({
          key: g,
          label: `${SEARCH_GROUP_LABELS[g]}（${list.filter((e) => e.group === g).length}）`,
        }))}
      />

      {tab === 'pan' ? (
        <div className="backup-tip" style={{ marginBottom: 12 }}>
          <div>
            <strong>说明</strong>
            <p style={{ margin: '4px 0 0' }}>
              网盘类多为第三方聚合站，域名可能变更失效；失效后可禁用或改成你自己的搜索地址。
            </p>
          </div>
        </div>
      ) : null}

      <Table
        className="admin-table-card"
        rowKey="id"
        loading={loading}
        dataSource={filtered}
        pagination={false}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            render: (v, row) => (
              <Space>
                <span style={{ fontWeight: 600 }}>{v}</span>
                {row.builtin ? <Tag>内置</Tag> : <Tag color="blue">自定义</Tag>}
              </Space>
            ),
          },
          {
            title: '标识',
            dataIndex: 'engine_key',
            width: 160,
            render: (v, row) => v || row.key,
          },
          {
            title: '搜索 URL',
            dataIndex: 'url',
            ellipsis: true,
          },
          {
            title: '排序',
            dataIndex: 'sort',
            width: 80,
          },
          {
            title: '启用',
            dataIndex: 'enabled',
            width: 90,
            render: (v, row) => <Switch checked={!!v} onChange={(checked) => void onToggle(row, checked)} />,
          },
          {
            title: '操作',
            width: 160,
            render: (_, row) => (
              <Space>
                <Button size="small" style={{ borderRadius: 6 }} onClick={() => openEdit(row)}>
                  编辑
                </Button>
                {!row.builtin ? (
                  <Popconfirm title="确认删除该自定义引擎？" onConfirm={() => void onDelete(row)}>
                    <Button size="small" danger style={{ borderRadius: 6 }}>
                      删除
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        className="admin-modal"
        title={
          <div>
            <div>{editing ? '编辑搜索引擎' : '添加搜索引擎'}</div>
            <div className="admin-modal-subtitle">
              搜索地址中用 {'{q}'} 表示关键词，例如 https://www.bing.com/search?q={'{q}'}
            </div>
          </div>
        }
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void onSubmit()}
        confirmLoading={submitting}
        okText={editing ? '保存' : '添加'}
        cancelText="取消"
        width={560}
        centered
        destroyOnHidden
      >
        <Form form={form} layout="vertical" className="admin-form">
          {!editing ? (
            <Form.Item
              name="key"
              label="标识（可选）"
              extra="小写字母开头；留空则自动生成"
              rules={[{ pattern: /^$|^[a-z][a-z0-9_-]{1,62}$/, message: '格式不正确' }]}
            >
              <Input placeholder="例如：searx" maxLength={64} />
            </Form.Item>
          ) : (
            <Form.Item name="key" label="标识">
              <Input disabled />
            </Form.Item>
          )}
          <Form.Item name="name" label="显示名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：SearXNG" maxLength={64} />
          </Form.Item>
          <Form.Item name="group" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
            <Select
              options={GROUPS.map((g) => ({ value: g, label: SEARCH_GROUP_LABELS[g] }))}
            />
          </Form.Item>
          <Form.Item
            name="url"
            label="搜索 URL"
            rules={[
              { required: true, message: '请输入搜索 URL' },
              {
                validator: async (_, v) => {
                  if (v && !String(v).includes('{q}')) throw new Error('必须包含 {q}')
                },
              },
            ]}
          >
            <Input placeholder="https://example.com/search?q={q}" />
          </Form.Item>
          <Form.Item name="sort" label="排序（越小越靠前）">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
