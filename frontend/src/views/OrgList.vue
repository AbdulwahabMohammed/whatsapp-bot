<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const orgs = ref([]);
const error = ref('');

async function load() {
  try {
    const res = await fetch('/api/orgs');
    if (!res.ok) throw new Error('failed');
    orgs.value = await res.json();
  } catch (e) {
    error.value = 'Failed to load organizations';
  }
}

onMounted(load);

watch(orgs, list => {
  if (!list.length) return;
  const lang = list[0].language || 'en';
  document.dir = /^ar/.test(lang) ? 'rtl' : 'ltr';
});

function logout() {
  fetch('/logout').then(() => router.push('/login'));
}
</script>

<template>
  <div class="p-4">
    <div class="flex justify-between mb-4">
      <h1 class="text-xl font-bold">Organizations</h1>
      <button @click="logout" class="text-sm text-blue-600">Logout</button>
    </div>
    <p v-if="error" class="text-red-500">{{ error }}</p>
    <table class="min-w-full border">
      <thead>
        <tr class="bg-gray-100">
          <th class="border px-2 py-1">Name</th>
          <th class="border px-2 py-1">Phone</th>
          <th class="border px-2 py-1">Language</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="o in orgs" :key="o.id">
          <td class="border px-2 py-1">{{ o.name }}</td>
          <td class="border px-2 py-1">{{ o.phone }}</td>
          <td class="border px-2 py-1">{{ o.language }}</td>
        </tr>
      </tbody>
    </table>
    <router-link to="/org/new" class="text-blue-600 mt-4 inline-block">Add Organization</router-link>
    <router-link to="/users" class="text-blue-600 mt-4 ml-4 inline-block">Users</router-link>
    <router-link to="/messages" class="text-blue-600 mt-4 ml-4 inline-block">Messages</router-link>
  </div>
</template>
