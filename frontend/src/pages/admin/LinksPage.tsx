import { useEffect, useState, type Key } from 'react'
import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  CloudServerOutlined,
  ImportOutlined,
  PlusOutlined,
  SearchOutlined,
  SwapOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  batchMoveLinks,
  createLink,
  deleteLink,
  fetchLinkMeta,
  getCategoriesFlat,
  getLinks,
  suggestLinkCategory,
  updateLink,
} from '../../api'
import IconPicker from '../../components/IconPicker'
import { IconRender } from '../../components/IconRender'
import BookmarkImportModal from '../../components/BookmarkImportModal'
import DockerImportModal from '../../components/DockerImportModal'

type LinkItem = {
  id: number
  url: string
  backup_url: string
  icon: string
  icon_url: string
  name: string
  category_id: number
  weight: number
  private: boolean
  description: string
}

type Category = { id: number; name: string }

function SwitchRow({
  value,
  onChange,
}: {
  value?: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <div className="admin-switch-row">
      <div>
        <strong>私有链接</strong>
        <span>开启后，未登录用户在前台不可见</span>
      </div>
      <Switch checked={!!value} onChange={onChange} />
    </div>
  )
}

export default function LinksPage() {
  const [list, setList] = useState<LinkItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [open, setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [dockerOpen, setDockerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState<LinkItem | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([])
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchCategoryId, setBatchCategoryId] = useState<number | undefined>()
  const [batchMoving, setBatchMoving] = useState(false)
  const [fetchingMeta, setFetchingMeta] = useState(false)
  const [suggestingCat, setSuggestingCat] = useState(false)
  const [catSuggestions, setCatSuggestions] = useState<
    { category_id: number; name: string; score: number; reason: string }[]
  >([])
  const [form] = Form.useForm()

  const loadCats = async () => {
    const res: any = await getCategoriesFlat()
    setCategories(res.data || [])
  }

  const load = async (p = page, size = pageSize) => {
    setLoading(true)
    try {
      const res: any = await getLinks({
        page: p,
        page_size: size,
        keyword: keyword || undefined,
        category_id: categoryId || undefined,
      })
      setList(res.data.list || [])
      setTotal(res.data.total || 0)
      setPage(res.data.page || p)
      setPageSize(res.data.page_size || size)
      setSelectedKeys([])
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCats()
    void load(1, pageSize)
  }, [])

  const openCreate = () => {
    setEditing(null)
    setCatSuggestions([])
    form.resetFields()
    form.setFieldsValue({ weight: 0, private: false })
    setOpen(true)
  }

  const openEdit = (row: LinkItem) => {
    setEditing(row)
    setCatSuggestions([])
    form.setFieldsValue(row)
    setOpen(true)
  }

  const onSubmit = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      if (editing) {
        await updateLink(editing.id, values)
        message.success('已更新')
      } else {
        await createLink(values)
        message.success('已创建')
      }
      setOpen(false)
      void load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const onDelete = async (id: number) => {
    try {
      await deleteLink(id)
      message.success('已删除')
      void load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const onFetchMeta = async () => {
    const url = String(form.getFieldValue('url') || '').trim()
    if (!url) {
      message.warning('请先填写 URL')
      return
    }
    setFetchingMeta(true)
    try {
      const res = await fetchLinkMeta(url)
      const data = res.data || ({} as any)
      const curName = String(form.getFieldValue('name') || '').trim()
      const curDesc = String(form.getFieldValue('description') || '').trim()
      const curIcon = String(form.getFieldValue('icon_url') || '').trim()
      const patch: Record<string, string> = {}
      if (data.url) patch.url = data.url
      if (data.name && (!curName || !editing)) patch.name = data.name
      if (data.description && !curDesc) patch.description = data.description
      if (data.icon_url && (!curIcon || !editing)) patch.icon_url = data.icon_url
      form.setFieldsValue(patch)
      if (data.partial) {
        message.warning(data.message || '仅识别到部分信息，请核对后保存')
      } else {
        message.success('已根据 URL 识别标题与图标')
      }
      // 识别后顺带刷新分类推荐
      void onSuggestCategory(true)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setFetchingMeta(false)
    }
  }

  const onSuggestCategory = async (silent = false) => {
    const name = String(form.getFieldValue('name') || '').trim()
    const description = String(form.getFieldValue('description') || '').trim()
    const url = String(form.getFieldValue('url') || '').trim()
    if (!name && !description && !url) {
      if (!silent) message.warning('请先填写名称、描述或 URL')
      return
    }
    setSuggestingCat(true)
    try {
      const res = await suggestLinkCategory({ name, description, url })
      const list = res.data?.suggestions || []
      setCatSuggestions(list)
      if (!silent) {
        if (!list.length) message.info(res.data?.message || '暂无明显匹配')
        else message.success(res.data?.message || '已生成分类推荐')
      }
      // 新增且未选分类时，自动填入最高分推荐
      if (!editing && list[0] && !form.getFieldValue('category_id')) {
        form.setFieldValue('category_id', list[0].category_id)
      }
    } catch (e) {
      if (!silent) message.error((e as Error).message)
    } finally {
      setSuggestingCat(false)
    }
  }

  const openBatchMove = () => {
    if (selectedKeys.length === 0) {
      message.warning('请先勾选要操作的链接')
      return
    }
    setBatchCategoryId(undefined)
    setBatchOpen(true)
  }

  const onBatchMove = async () => {
    if (selectedKeys.length === 0) {
      message.warning('请先勾选链接')
      return
    }
    if (!batchCategoryId) {
      message.warning('请选择目标分类')
      return
    }
    setBatchMoving(true)
    try {
      await batchMoveLinks({
        ids: selectedKeys.map((k) => Number(k)),
        category_id: batchCategoryId,
      })
      message.success(`已将 ${selectedKeys.length} 条链接移动到新分类`)
      setBatchOpen(false)
      setBatchCategoryId(undefined)
      void load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setBatchMoving(false)
    }
  }

  return (
    <div className="admin-shell-card">
      <div className="admin-page-header">
        <div>
          <h2>链接列表</h2>
          <p className="admin-page-desc">管理导航链接，支持搜索、分类筛选与批量改分类</p>
        </div>
        <Space wrap>
          <Input.Search
            placeholder="搜索名称/URL/描述"
            allowClear
            onSearch={() => void load(1)}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 220, borderRadius: 6 }}
          />
          <Select
            allowClear
            placeholder="按分类筛选"
            style={{ width: 160 }}
            value={categoryId}
            onChange={(v) => {
              setCategoryId(v)
              setTimeout(() => void load(1), 0)
            }}
            options={categories.map((c) => ({ label: c.name, value: c.id }))}
          />
          <Button
            icon={<SwapOutlined />}
            onClick={openBatchMove}
            disabled={selectedKeys.length === 0}
            style={{ borderRadius: 6 }}
          >
            批量操作{selectedKeys.length > 0 ? `（${selectedKeys.length}）` : ''}
          </Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)} style={{ borderRadius: 6 }}>
            导入书签
          </Button>
          <Button
            icon={<CloudServerOutlined />}
            onClick={() => setDockerOpen(true)}
            style={{ borderRadius: 6 }}
          >
            Docker 容器
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ borderRadius: 6 }}>
            新增链接
          </Button>
        </Space>
      </div>

      <Table
        className="admin-table-card"
        rowKey="id"
        loading={loading}
        dataSource={list}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: (keys) => setSelectedKeys(keys),
        }}
        pagination={{
          current: page,
          total,
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, size) => {
            const nextSize = size || pageSize
            if (nextSize !== pageSize) {
              setPageSize(nextSize)
              void load(1, nextSize)
              return
            }
            void load(p, nextSize)
          },
        }}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            width: 220,
            ellipsis: true,
            render: (v, row) => (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minWidth: 0,
                  maxWidth: 200,
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: '#f3f4f6',
                    display: 'inline-grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <IconRender value={row.icon_url || row.icon} size={16} fallback={String(v).slice(0, 1)} />
                </span>
                <Typography.Text
                  ellipsis={{ tooltip: v }}
                  style={{ fontWeight: 600, margin: 0, flex: 1, minWidth: 0, lineHeight: '32px' }}
                >
                  {v}
                </Typography.Text>
              </div>
            ),
          },
          {
            title: 'URL',
            dataIndex: 'url',
            ellipsis: true,
            render: (v) => (
              <Typography.Text ellipsis={{ tooltip: v }} style={{ maxWidth: '100%' }}>
                <Typography.Link href={v} target="_blank" rel="noreferrer">
                  {v}
                </Typography.Link>
              </Typography.Text>
            ),
          },
          {
            title: '分类',
            dataIndex: 'category_id',
            render: (v) => categories.find((c) => c.id === v)?.name || v,
          },
          { title: '权重', dataIndex: 'weight', width: 80 },
          {
            title: '私有',
            dataIndex: 'private',
            width: 90,
            render: (v) => (
              <span className={`admin-status-pill ${v ? 'is-private' : 'is-public'}`}>{v ? '私有' : '公开'}</span>
            ),
          },
          {
            title: '操作',
            width: 160,
            render: (_, row) => (
              <Space>
                <Button size="small" style={{ borderRadius: 6 }} onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Popconfirm title="确认删除？" onConfirm={() => onDelete(row.id)}>
                  <Button size="small" danger style={{ borderRadius: 6 }}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        className="admin-modal"
        title={
          <div>
            <div>批量操作</div>
            <div className="admin-modal-subtitle">已选 {selectedKeys.length} 条链接，选择目标分类后确认</div>
          </div>
        }
        open={batchOpen}
        onCancel={() => {
          setBatchOpen(false)
          setBatchCategoryId(undefined)
        }}
        onOk={() => void onBatchMove()}
        confirmLoading={batchMoving}
        okText="确认移动"
        cancelText="取消"
        width={440}
        centered
        destroyOnHidden
      >
        <Form layout="vertical" className="admin-form">
          <Form.Item label="目标分类" required style={{ marginBottom: 0 }}>
            <Select
              placeholder="请选择要移动到的分类"
              value={batchCategoryId}
              onChange={setBatchCategoryId}
              options={categories.map((c) => ({ label: c.name, value: c.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        className="admin-modal"
        title={
          <div>
            <div>{editing ? '编辑链接' : '新增链接'}</div>
            <div className="admin-modal-subtitle">
              {editing ? '修改链接信息、图标与分类' : '添加一条导航链接'}
            </div>
          </div>
        }
        open={open}
        onCancel={() => setOpen(false)}
        onOk={onSubmit}
        confirmLoading={submitting}
        okText={editing ? '保存' : '创建'}
        cancelText="取消"
        width={680}
        centered
        destroyOnHidden
      >
        <Form form={form} layout="vertical" className="admin-form">
          <div className="admin-form-block">
            <div className="admin-form-block-title">基础信息</div>
            <Form.Item name="name" label="链接名称" rules={[{ required: true, message: '请输入链接名称' }]}>
              <Input placeholder="例如：GitHub" maxLength={128} />
            </Form.Item>
            <Row gutter={12}>
              <Col span={16}>
                <Form.Item name="url" label="URL" rules={[{ required: true, message: '请输入 URL' }]}>
                  <Input
                    placeholder="https://"
                    onPressEnter={(e) => {
                      e.preventDefault()
                      void onFetchMeta()
                    }}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label=" ">
                  <Button
                    block
                    icon={<SearchOutlined />}
                    loading={fetchingMeta}
                    onClick={() => void onFetchMeta()}
                    style={{ borderRadius: 6 }}
                  >
                    识别标题/图标
                  </Button>
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="backup_url" label="备用 URL">
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea rows={3} placeholder="可选，用于前台展示说明" maxLength={500} />
            </Form.Item>
          </div>

          <div className="admin-form-block">
            <div className="admin-form-block-title">图标</div>
            <Form.Item name="icon" label="上传图标">
              <IconPicker uploadOnly />
            </Form.Item>
            <Form.Item name="icon_url" label="图标链接（可选）">
              <Input placeholder="https://.../favicon.ico" />
            </Form.Item>
          </div>

          <div className="admin-form-block">
            <div className="admin-form-block-title">分类与权限</div>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="category_id"
                  label="所属分类"
                  rules={[{ required: true, message: '请选择所属分类' }]}
                >
                  <Select
                    allowClear={false}
                    placeholder="请选择分类"
                    options={categories.map((c) => ({ label: c.name, value: c.id }))}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label=" ">
                  <Button
                    block
                    icon={<ThunderboltOutlined />}
                    loading={suggestingCat}
                    onClick={() => void onSuggestCategory()}
                    style={{ borderRadius: 6 }}
                  >
                    智能推荐分类
                  </Button>
                </Form.Item>
              </Col>
            </Row>
            {catSuggestions.length > 0 ? (
              <div className="link-cat-suggestions">
                <span className="link-cat-suggestions-label">推荐：</span>
                <Space size={[8, 8]} wrap>
                  {catSuggestions.map((s) => (
                    <Tag
                      key={s.category_id}
                      color="processing"
                      style={{ cursor: 'pointer', borderRadius: 6, marginInlineEnd: 0 }}
                      onClick={() => {
                        form.setFieldValue('category_id', s.category_id)
                        message.success(`已选择「${s.name}」`)
                      }}
                      title={s.reason}
                    >
                      {s.name}
                      <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                        {Math.round(s.score * 100)}%
                      </Typography.Text>
                    </Tag>
                  ))}
                </Space>
              </div>
            ) : null}
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="weight" label="权重">
                  <InputNumber controls={false} style={{ width: '100%' }} placeholder="0" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="private" style={{ marginBottom: 0 }}>
              <SwitchRow />
            </Form.Item>
          </div>
        </Form>
      </Modal>
      <BookmarkImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => void load(1)}
      />
      <DockerImportModal
        open={dockerOpen}
        categories={categories}
        onClose={() => setDockerOpen(false)}
        onSuccess={() => void load(1)}
      />
    </div>
  )
}
