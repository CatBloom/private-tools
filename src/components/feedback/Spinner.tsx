type SpinnerProps = { label?: string }

export const Spinner = ({ label }: SpinnerProps) => (
  <div className="fbk-spinner-wrap" role="status" aria-label={label ?? '読み込み中'}>
    <div className="fbk-spinner" aria-hidden="true" />
    {label ? <span className="fbk-spinner-label">{label}</span> : null}
  </div>
)
