import { useEffect, useMemo, useState } from 'react'
import { Button, Empty, Input, Modal, Pagination, Tabs, Upload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import * as LucideIcons from 'lucide-react'
import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import { IconRender, listLucideIconNames, parseIconValue, toLucideValue } from './IconRender'
import { uploadIcon } from '../api'

type Props = {
  value?: string
  onChange?: (value: string) => void
  /** upload only (links page) */
  uploadOnly?: boolean
}

const ALL_ICONS = listLucideIconNames()
const PAGE_SIZE = 72

export default function IconPicker({ value, onChange, uploadOnly = false }: Props) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [uploading, setUploading] = useState(false)
  const parsed = parseIconValue(value)

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return ALL_ICONS
    return ALL_ICONS.filter((name) => name.toLowerCase().includes(kw))
  }, [keyword])

  useEffect(() => {
    setPage(1)
  }, [keyword])

  useEffect(() => {
    if (open) {
      setKeyword('')
      setPage(1)
    }
  }, [open])

  const pageIcons = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const selectLucide = (name: string) => {
    onChange?.(toLucideValue(name))
    setOpen(false)
  }

  const label =
    parsed.type === 'lucide'
      ? parsed.name
      : parsed.type === 'image'
        ? '已上传图片'
        : parsed.type === 'text'
          ? parsed.text
          : uploadOnly
            ? '未上传图标'
            : '未选择图标'

  const uploadPane = (
    <Upload.Dragger
      accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.ico"
      maxCount={1}
      showUploadList={false}
      disabled={uploading}
      style={{ borderRadius: 8, background: '#f3f4f6', border: 'none', padding: 24 }}
      customRequest={async ({ file, onSuccess, onError }) => {
        setUploading(true)
        try {
          const res: any = await uploadIcon(file as File)
          onChange?.(res.data.url)
          message.success('上传成功')
          onSuccess?.(res.data)
          setOpen(false)
        } catch (e) {
          message.error((e as Error).message)
          onError?.(e as Error)
        } finally {
          setUploading(false)
        }
      }}
    >
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">{uploading ? '上传中...' : '点击或拖拽图片到此处上传'}</p>
      <p className="ant-upload-hint">支持 png / jpg / webp / svg / ico，最大 2MB</p>
    </Upload.Dragger>
  )

  return (
    <div>
      <div className="icon-picker-field">
        <div className="icon-picker-preview">
          <IconRender value={value} size={22} fallback="—" />
        </div>
        <div className="icon-picker-meta">
          <strong>{value ? '当前图标' : uploadOnly ? '上传图标' : '选择图标'}</strong>
          <span>{label}</span>
        </div>
        <div className="icon-picker-actions">
          {value ? <Button onClick={() => onChange?.('')}>清除</Button> : null}
          <Button type="primary" onClick={() => setOpen(true)}>
            {value ? '更换' : uploadOnly ? '上传' : '选择'}
          </Button>
        </div>
      </div>

      <Modal
        className="admin-modal"
        title={
          <div>
            <div>{uploadOnly ? '上传图标' : '选择图标'}</div>
            <div className="admin-modal-subtitle">
              {uploadOnly
                ? '上传自定义图片作为链接图标'
                : '从 Lucide 图标库选择，或上传自定义图片'}
            </div>
          </div>
        }
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={uploadOnly ? 520 : 780}
        centered
        destroyOnHidden
      >
        {uploadOnly ? (
          uploadPane
        ) : (
          <Tabs
            items={[
              {
                key: 'lucide',
                label: '图标库',
                children: (
                  <div>
                    <Input.Search
                      allowClear
                      placeholder="搜索图标，例如 folder / home / star"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      style={{ marginBottom: 14, borderRadius: 6 }}
                    />
                    {filtered.length === 0 ? (
                      <Empty description="没有匹配的图标" />
                    ) : (
                      <>
                        <div className="icon-picker-grid">
                          {pageIcons.map((name) => {
                            const Comp = (LucideIcons as unknown as Record<string, ComponentType<LucideProps>>)[name]
                            const active = parsed.type === 'lucide' && parsed.name === name
                            if (!Comp) return null
                            return (
                              <button
                                key={name}
                                type="button"
                                className={`icon-picker-item${active ? ' active' : ''}`}
                                title={name}
                                onClick={() => selectLucide(name)}
                              >
                                <Comp size={22} strokeWidth={1.75} />
                                <span>{name}</span>
                              </button>
                            )
                          })}
                        </div>
                        <div className="icon-picker-pagination">
                          <span className="icon-picker-count">
                            共 {filtered.length} 个
                            {keyword.trim() ? '（已筛选）' : ''}
                          </span>
                          <Pagination
                            size="small"
                            current={page}
                            pageSize={PAGE_SIZE}
                            total={filtered.length}
                            showSizeChanger={false}
                            onChange={setPage}
                          />
                        </div>
                      </>
                    )}
                  </div>
                ),
              },
              {
                key: 'upload',
                label: '上传图片',
                children: uploadPane,
              },
            ]}
          />
        )}
      </Modal>
    </div>
  )
}
