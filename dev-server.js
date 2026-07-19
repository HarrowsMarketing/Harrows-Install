import dotenv from 'dotenv'
dotenv.config()

import app from './api/index.js'

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Install EOD API running on port ${PORT}`))
