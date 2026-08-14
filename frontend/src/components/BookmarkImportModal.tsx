import { useEffect, useState } from 'react'
import { Button, Form, Modal, Select, Switch, Upload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { getCategoriesFlat, importBookmarks } from '../api'

type Props = {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

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
        <strong>导入为私有</strong>
        <span>开启后，未登录用户在前台不可见</span>
      </div>
      <Switch checked={!!value} onChange={onChange} />
    </div>
  )
}

export default function BookmarkImportModal({ open, onClose, onSuccess }: Props) {
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [html, setHtml] = useState('')
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    if (!open) return
    getCategoriesFlat().then((res: any) => setCategories(res.data || []))
    form.resetFields()
    form.setFieldsValue({ private: false })
    setHtml('')
    setFileName('')
  }, [open, form])

  const onImport = async () => {
    const values = await form.validateFields()
    if (!html) {
      message.warning('请先上传书签 HTML 文件')
      return
    }
    setLoading(true)
    try {
      const res: any = await importBookmarks({
        html,
        category_id: values.category_id,
        private: values.private || false,
      })
      message.success(`解析 ${res.data.parsed} 条，成功导入 ${res.data.imported} 条`)
      onClose()
      onSuccess?.()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      className="admin-modal bookmark-import-modal"
      title={
        <div>
          <div>书签导入</div>
          <div className="admin-modal-subtitle">导入 Chrome / Edge 导出的书签 HTML</div>
        </div>
      }
      open={open}
      onCancel={onClose}
      onOk={onImport}
      confirmLoading={loading}
      okText="开始导入"
      cancelText="取消"
      width={560}
      centered
      destroyOnHidden
    >
      <ol className="bookmark-steps">
        <li>
          <span className="bookmark-step-num">1</span>
          <div className="bookmark-step-body">
            <strong>导出书签</strong>
            <p>浏览器打开书签管理器 → 导出书签，得到 .html 文件</p>
          </div>
        </li>
        <li>
          <span className="bookmark-step-num">2</span>
          <div className="bookmark-step-body">
            <strong>选择目标分类</strong>
            <p>导入的链接会入到你指定的分类下</p>
          </div>
        </li>
        <li>
          <span className="bookmark-step-num">3</span>
          <div className="bookmark-step-body">
            <strong>上传并导入</strong>
            <p>上传 HTML 后点击「开始导入」</p>
          </div>
        </li>
      </ol>

      <Form form={form} layout="vertical" className="admin-form" initialValues={{ private: false }}>
        <div className="admin-form-block">
          <div className="admin-form-block-title">导入设置</div>
          <Form.Item
            name="category_id"
            label="导入到分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select
              allowClear={false}
              placeholder="请先在分类列表创建分类"
              options={categories.map((c) => ({ label: c.name, value: c.id }))}
            />
          </Form.Item>
          <Form.Item name="private" style={{ marginBottom: 0 }}>
            <SwitchRow />
          </Form.Item>
        </div>

        <div className="admin-form-block">
          <div className="admin-form-block-title">书签文件</div>
          <Form.Item style={{ marginBottom: 0 }}>
            <Upload.Dragger
              className="bookmark-uploader"
              accept=".html,.htm"
              maxCount={1}
              showUploadList={false}
              beforeUpload={(file) => {
                const reader = new FileReader()
                reader.onload = () => {
                  setHtml(String(reader.result || ''))
                  setFileName(file.name)
                  message.success(`已选择 ${file.name}`)
                }
                reader.readAsText(file)
                return false
              }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                {fileName ? `已选择：${fileName}` : '点击或拖拽上传 bookmarks.html'}
              </p>
              <p className="ant-upload-hint">仅支持 Chrome / Edge 导出的 .html / .htm 文件</p>
            </Upload.Dragger>
          </Form.Item>
          {fileName ? (
            <div className="bookmark-file-bar">
              <span>{fileName}</span>
              <Button
                type="link"
                danger
                onClick={() => {
                  setHtml('')
                  setFileName('')
                }}
              >
                移除
              </Button>
            </div>
          ) : null}
        </div>
      </Form>
    </Modal>
  )
}
