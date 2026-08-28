import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base must match the Pages subpath: bloom79.github.io/cafeplan/
export default defineConfig({
  base: '/cafeplan/',
  plugins: [react()],
})
