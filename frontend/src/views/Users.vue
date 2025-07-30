<script setup>
import { ref, onMounted } from 'vue';

const users = ref([]);
const error = ref('');

async function load() {
  try {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('failed');
    users.value = await res.json();
  } catch (e) {
    error.value = 'Failed to load users';
  }
}

async function updateRole(id, role) {
  await fetch(`/users/${id}/role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ role }),
  });
  load();
}

async function disable2fa(id) {
  await fetch(`/users/${id}/disable-2fa`, { method: 'POST' });
  load();
}

onMounted(load);
</script>

<template>
  <div class="p-4">
    <h1 class="text-xl font-bold mb-4">Users</h1>
    <p v-if="error" class="text-red-500 mb-2">{{ error }}</p>
    <table class="min-w-full border">
      <thead>
        <tr class="bg-gray-100">
          <th class="border px-2 py-1">Username</th>
          <th class="border px-2 py-1">Role</th>
          <th class="border px-2 py-1">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in users" :key="u.id">
          <td class="border px-2 py-1">{{ u.username }}</td>
          <td class="border px-2 py-1">
            <select v-model="u.role" @change="updateRole(u.id, u.role)" class="border rounded p-1">
              <option value="admin">admin</option>
              <option value="editor">editor</option>
            </select>
          </td>
          <td class="border px-2 py-1">
            <button @click="disable2fa(u.id)" class="text-sm text-blue-600">Disable 2FA</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
