import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// React.lazy のページはフルスイート並列実行時に既定の 1 秒を超えることがあるため、findBy*/waitFor の待ち時間を延ばす。
configure({ asyncUtilTimeout: 3000 })
