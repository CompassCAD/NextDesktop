import { useEffect, useRef, useState } from 'react'
import UploadImageIcon from '../assets/icons/upimg.svg'
import CloseIcon from '../assets/icons/close.svg'
import styles from '../style/index.module.css'
import { getDialogPath } from '@renderer/utils/FileImporter'
import { getLocaleKey } from '@renderer/locales/Locale'

interface ImagePickerProps {
  defaultValue: string
  onChange?: (value: string) => void
}

export default function ImagePicker(props: ImagePickerProps): React.ReactElement {
  const [imageSrc, setImageSrc] = useState<string>(props.defaultValue)
  const containerRef = useRef<HTMLDivElement>(null)
  const [boundRect, setBoundRect] = useState<DOMRect | null>(null)
  const [imagePickerModalOpen, setImagePickerModalOpen] = useState<boolean>(false)

  useEffect(() => {
    if (containerRef.current) {
      setBoundRect(containerRef.current.getBoundingClientRect())
    }
  }, [containerRef.current])

  const openImagePicker = async (): Promise<void> => {
    const file = await window.api.showOpenFileDialog({
      title: getLocaleKey('editor.inspector.imagepicker.heading'),
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
    })
    const filePath = getDialogPath(file)
    console.log('Selected file path:', filePath)

    if (filePath) {
      // Determine mime type properly (e.g., handles jpg -> jpeg mapping)
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
      const mimeType = ext === 'jpg' ? 'jpeg' : ext

      // Get file content
      const fileContent = window.api.readFile(filePath, 'base64')

      const base64Image = `data:image/${mimeType};base64,${fileContent}`
      handleChange(base64Image)
    }
  }

  // Handle change on either text input or image pick
  const handleChange = (newValue: string): void => {
    setImageSrc(newValue)
    if (props.onChange) {
      props.onChange(newValue)
    }
  }

  return (
    <>
      {imagePickerModalOpen && (
        <div
          className={styles['image-picker-modal']}
          style={{
            top: boundRect ? boundRect.top - 80 : 0,

            right: boundRect ? window.innerWidth - boundRect.right + 80 : 0
          }}
        >
          <div className={styles['image-picker-modal-header']}>
            <h3>{getLocaleKey('editor.inspector.imagepicker.heading')}</h3>
            <img
              src={CloseIcon}
              alt="Close"
              height={16}
              onClick={() => setImagePickerModalOpen(false)}
            />
          </div>
          <div className={styles['image-picker-modal-image']} onClick={openImagePicker}>
            <div className={styles['image-picker-modal-image-hover']}>
              <span>{getLocaleKey('editor.inspector.imagepicker.uploadFromFile')}</span>
            </div>
            <img src={imageSrc} alt="Selected" height={200} />
          </div>
          <span>{getLocaleKey('editor.inspector.imagepicker.useURL')}</span>
          <input
            type="text"
            placeholder="Image URL"
            value={imageSrc}
            onChange={(e) => handleChange(e.target.value)}
          />
        </div>
      )}
      <div ref={containerRef} className={styles['image-picker-container']}>
        <img
          src={imageSrc}
          className={styles['image-picker-image']}
          alt="Selected image"
          height={26}
        />
        <button
          className={styles['image-picker-button']}
          onClick={() => setImagePickerModalOpen(true)}
        >
          <img src={UploadImageIcon} alt="Upload" height={24} />
        </button>
      </div>
    </>
  )
}
