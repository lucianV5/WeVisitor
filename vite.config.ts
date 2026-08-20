import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import path from 'node:path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

export default defineConfig({
  plugins: [
    uni(),
    AutoImport({
      imports: [
        'vue',
        'uni-app',
        'pinia',
      ],
      dts: 'src/auto-imports.d.ts',
      dirs: ['src/store', 'src/utils', 'src/services'],
    }),
    Components({
      dirs: ['src/components'],
      dts: 'src/components.d.ts',
      deep: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `
          @import "@/styles/variables.scss";
          @import "@/styles/theme.scss";
        `,
      },
    },
  },
})
