import styles from '../style/workflow.module.css'

export default function GuideBorder(): React.ReactElement {
  return (
    <svg className={styles.guideBorder} aria-hidden="true">
      <rect x="1" y="1" rx="7" />
    </svg>
  )
}
