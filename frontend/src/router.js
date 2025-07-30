import { createRouter, createWebHistory } from 'vue-router';
import Login from './views/Login.vue';
import OrgList from './views/OrgList.vue';
import Users from './views/Users.vue';
import NewOrg from './views/NewOrg.vue';
import Messages from './views/Messages.vue';

const routes = [
  { path: '/login', component: Login },
  { path: '/', component: OrgList },
  { path: '/org/new', component: NewOrg } ,
  { path: '/users', component: Users },
  { path: '/messages', component: Messages },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
