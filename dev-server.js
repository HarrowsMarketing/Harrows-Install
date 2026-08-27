import dotenv from 'dotenv'
dotenv.config()

// Dynamic import (not a static one) so it evaluates here, after dotenv.config() —
// a static `import app from './api/index.js'` gets hoisted and runs before this
// file's own top-level code, so api/index.js's `process.env.SUPABASE_URL` etc.
// (captured into module-scope consts at import time) would be undefined.
const { default: app } = await import('./api/index.js')

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Install EOD API running on port ${PORT}`))
