import { useEffect, useMemo, useState, type Key } from 'react'
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
  message,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { createCategory, deleteCategory, getCategoriesFlat, updateCategory } from '../../api'
import IconPicker from '../../components/IconPicker'
import { IconRender } from '../../components/IconRender'

type Category = {
  id: number
  name: string
  icon: string
  parent_id?: number | null
  sort: number
  private: boolean
}

type CategoryNode = Category & {
  children?: CategoryNode[]
  level?: number
  isLast?: boolean
}

function SwitchRow({
  value,
  onChange,
  title = '私有分类',
  desc = '开启后，未登录用户在前台不可见',
}: {
  value?: boolean
  onChange?: (v: boolean) => void
  title?: string
  desc?: string
}) {
  return (
    <div className="admin-switch-row">
      <div>
        <strong>{title}</strong>
        <span>{desc}</span>
      </div>
      <Switch checked={!!value} onChange={onChange} />
    </div>
  )
}

function buildTree(list: Category[]): CategoryNode[] {
  const map = new Map<number, CategoryNode>()
  list.forEach((item) => {
    map.set(item.id, { ...item, children: [] })
  })

  const roots: CategoryNode[] = []
  list.forEach((item) => {
    const node = map.get(item.id)!
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children!.push(node)
    } else {
      roots.push(node)
    }
  })

  const sortNodes = (nodes: CategoryNode[], level = 0): CategoryNode[] =>
    nodes
      .sort((a, b) => a.sort - b.sort || a.id - b.id)
      .map((node, index, arr) => {
        const children =
          node.children && node.children.length > 0 ? sortNodes(node.children, level + 1) : undefined
        return {
          ...node,
          level,
          isLast: index === arr.length - 1,
          children,
        }
      })

  return sortNodes(roots)
}

function TreeGuide({ level = 0, isLast = false }: { level?: number; isLast?: boolean }) {
  if (!level) return null
  return (
    <span className="cat-tree-guide" aria-hidden>
      {Array.from({ length: level - 1 }).map((_, i) => (
        <span key={i} className="cat-tree-guide-seg">
          │
        </span>
      ))}
      <span className="cat-tree-guide-seg">{isLast ? '└' : '├'}</span>
    </span>
  )
}

/** 收集某节点的所有子孙 id，避免选自己/子孙做父级 */
function collectDescendantIds(list: Category[], rootId: number): Set<number> {
  const banned = new Set<number>([rootId])
  let changed = true
  while (changed) {
    changed = false
    list.forEach((item) => {
      if (item.parent_id && banned.has(item.parent_id) && !banned.has(item.id)) {
        banned.add(item.id)
        changed = true
      }
    })
  }
  return banned
}

/** 最多两层：父级只能选顶级分类 */
function buildParentOptions(list: Category[], editingId?: number) {
  const banned = editingId ? collectDescendantIds(list, editingId) : new Set<number>()
  return list
    .filter((item) => !item.parent_id && !banned.has(item.id))
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
    .map((item) => ({ value: item.id, label: item.name }))
}

export default function CategoriesPage() {
  const [list, setList] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<readonly Key[]>([])
  const [form] = Form.useForm()

  const treeData = useMemo(() => buildTree(list), [list])
  const parentOptions = useMemo(
    () => buildParentOptions(list, editing?.id),
    [list, editing?.id],
  )
  const editingHasChildren = useMemo(
    () => (editing ? list.some((i) => i.parent_id === editing.id) : false),
    [list, editing],
  )

  const load = async () => {
    setLoading(true)
    try {
      const res: any = await getCategoriesFlat()
      const rows: Category[] = res.data || []
      setList(rows)
      setExpandedKeys(rows.map((i) => i.id))
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ sort: 0, private: false, icon: '' })
    setOpen(true)
  }

  const openEdit = (row: Category) => {
    setEditing(row)
    form.setFieldsValue({
      name: row.name,
      icon: row.icon,
      parent_id: row.parent_id ?? undefined,
      sort: row.sort,
      private: row.private,
    })
    setOpen(true)
  }

  const onSubmit = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      const payload = {
        ...values,
        parent_id: values.parent_id ?? null,
      }
      if (editing) {
        await updateCategory(editing.id, payload)
        message.success('已更新')
      } else {
        await createCategory(payload)
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
      await deleteCategory(id)
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
          <h2>分类列表</h2>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ borderRadius: 6 }}>
          新增分类
        </Button>
      </div>

      <Table
        className="admin-table-card cat-tree-table"
        rowKey="id"
        loading={loading}
        dataSource={treeData}
        pagination={false}
        rowClassName={(row) => `cat-row-level-${Math.min(row.level || 0, 5)}`}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: setExpandedKeys,
          defaultExpandAllRows: true,
          indentSize: 22,
        }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          {
            title: '名称',
            dataIndex: 'name',
            render: (v, row) => {
              const childCount = row.children?.length || 0
              const iconSize = Math.max(12, 16 - (row.level || 0))
              return (
                <span className="cat-name-cell">
                  <TreeGuide level={row.level} isLast={row.isLast} />
                  <span className="cat-name-icon">
                    <IconRender value={row.icon} size={iconSize} fallback="—" />
                  </span>
                  <span className="cat-name-title">{v}</span>
                  {(row.level || 0) > 0 ? <span className="cat-level-tag">L{row.level}</span> : null}
                  {childCount > 0 ? <span className="cat-child-count">{childCount}</span> : null}
                </span>
              )
            },
          },
          {
            title: '父级',
            dataIndex: 'parent_id',
            width: 140,
            render: (v) => list.find((i) => i.id === v)?.name || '顶级',
          },
          { title: '排序', dataIndex: 'sort', width: 80 },
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
            width: 200,
            render: (_, row) => (
              <Space>
                {(row.level || 0) === 0 ? (
                  <Button
                    size="small"
                    style={{ borderRadius: 6 }}
                    onClick={() => {
                      setEditing(null)
                      form.resetFields()
                      form.setFieldsValue({ sort: 0, private: false, icon: '', parent_id: row.id })
                      setOpen(true)
                    }}
                  >
                    加子类
                  </Button>
                ) : null}
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
            <div>{editing ? '编辑分类' : '新增分类'}</div>
            <div className="admin-modal-subtitle">
              {editing ? '调整分类名称、图标、父级与权限' : '最多两层，子类只能挂在顶级分类下'}
            </div>
          </div>
        }
        open={open}
        onCancel={() => setOpen(false)}
        onOk={onSubmit}
        confirmLoading={submitting}
        okText={editing ? '保存' : '创建'}
        cancelText="取消"
        width={520}
        centered
        destroyOnHidden
      >
        <Form form={form} layout="vertical" className="admin-form" requiredMark={false}>
          <div className="admin-form-block">
            <div className="admin-form-block-title">基础信息</div>
            <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
              <Input placeholder="例如：常用工具" maxLength={64} />
            </Form.Item>
            <Form.Item name="icon" label="图标">
              <IconPicker />
            </Form.Item>
          </div>

          <div className="admin-form-block">
            <div className="admin-form-block-title">层级结构</div>
            <Row gutter={12}>
              <Col span={14}>
                <Form.Item
                  name="parent_id"
                  label="父级分类"
                  extra={
                    editingHasChildren
                      ? '该分类下已有子类，只能保持为顶级'
                      : '仅可选顶级分类；不选则为顶级'
                  }
                >
                  <Select
                    allowClear
                    placeholder="无（顶级分类）"
                    options={parentOptions}
                    disabled={editingHasChildren}
                  />
                </Form.Item>
              </Col>
              <Col span={10}>
                <Form.Item name="sort" label="同级排序" extra="越小越靠前">
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
    </div>
  )
}
