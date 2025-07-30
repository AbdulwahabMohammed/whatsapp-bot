<script setup>
import { ref } from 'vue';

const phone = ref('');
const from = ref('');
const to = ref('');
const results = ref([]);
const error = ref('');

async function search() {
  error.value = '';
  const body = new URLSearchParams({ phone: phone.value, from: from.value, to: to.value });
  const res = await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (res.ok) {
    results.value = await res.json();
  } else {
    error.value = 'Search failed';
  }
}
</script>

<template>
  <div class="p-4">
    <h1 class="text-xl font-bold mb-4">Search Messages</h1>
    <form @submit.prevent="search" class="space-y-3 mb-4">
      <div>
        <label class="block text-sm font-medium mb-1">Phone</label>
        <input v-model="phone" class="border rounded w-full p-2" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">From</label>
        <input type="date" v-model="from" class="border rounded w-full p-2" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">To</label>
        <input type="date" v-model="to" class="border rounded w-full p-2" />
      </div>
      <p v-if="error" class="text-red-500">{{ error }}</p>
      <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded">Search</button>
    </form>
    <table v-if="results.length" class="min-w-full border text-sm">
      <thead>
        <tr class="bg-gray-100">
          <th class="border px-1">Date</th>
          <th class="border px-1">Org</th>
          <th class="border px-1">Phone</th>
          <th class="border px-1">Sender</th>
          <th class="border px-1">Text</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in results" :key="r.created_at">
          <td class="border px-1">{{ r.created_at }}</td>
          <td class="border px-1">{{ r.organization }}</td>
          <td class="border px-1">{{ r.customer_phone }}</td>
          <td class="border px-1">{{ r.sender }}</td>
          <td class="border px-1">{{ r.text }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
