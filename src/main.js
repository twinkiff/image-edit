import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import VueKonva from 'vue-konva';

const app = createApp(App)
app.use(VueKonva);
app.config.errorHandler = (err, vm, info) => {
  // TODO: Proper error reporting mechanism
  window.alert(`An unknown error occured: ${err} (${info})!`);
};
app.mount('#app')
