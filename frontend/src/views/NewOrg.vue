<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const name = ref('');
const phone = ref('');
const language = ref('ar');
const instructions = ref('');
const start = ref('');
const end = ref('');
const error = ref('');

async function submit() {
  error.value = '';
  if (!name.value || !phone.value) {
    error.value = 'Name and phone are required';
    return;
  }
  const body = new URLSearchParams({
    name: name.value,
    phone: phone.value,
    language: language.value,
    instructions: instructions.value,
    working_hours_start: start.value,
    working_hours_end: end.value,
  });
  const res = await fetch('/org/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (res.ok) {
    router.push('/');
  } else {
    error.value = 'Failed to save';
  }
}
</script>

<template>
  <div class="max-w-md mx-auto p-4">
    <h1 class="text-xl font-bold mb-4">Add Organization</h1>
    <form @submit.prevent="submit" class="space-y-3">
      <div>
        <label class="block text-sm font-medium mb-1">Name</label>
        <input v-model="name" required class="border rounded w-full p-2" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Phone</label>
        <input v-model="phone" required class="border rounded w-full p-2" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Language</label>
        <input v-model="language" class="border rounded w-full p-2" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Working hours start</label>
        <input type="time" v-model="start" class="border rounded w-full p-2" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Working hours end</label>
        <input type="time" v-model="end" class="border rounded w-full p-2" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Instructions</label>
        <textarea v-model="instructions" rows="4" class="border rounded w-full p-2"></textarea>
      </div>
      <p v-if="error" class="text-red-500">{{ error }}</p>
      <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded">Save</button>
    </form>
  </div>
</template>
