import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './css/main.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
