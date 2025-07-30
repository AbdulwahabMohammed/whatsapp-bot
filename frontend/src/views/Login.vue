<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const username = ref('');
const password = ref('');
const token = ref('');
const error = ref('');

async function submit() {
  error.value = '';
  if (!username.value || !password.value) {
    error.value = 'Username and password are required';
    return;
  }
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      username: username.value,
      password: password.value,
      token: token.value,
    }),
  });
  if (res.ok) {
    router.push('/');
  } else {
    error.value = 'Login failed';
  }
}
</script>

<template>
  <div class="max-w-sm mx-auto mt-10 p-4">
    <h1 class="text-xl font-bold mb-4">Admin Login</h1>
    <form @submit.prevent="submit" class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1">Username</label>
        <input v-model="username" required class="border rounded w-full p-2" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Password</label>
        <input type="password" v-model="password" required class="border rounded w-full p-2" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">2FA Token</label>
        <input v-model="token" class="border rounded w-full p-2" />
      </div>
      <p v-if="error" class="text-red-500">{{ error }}</p>
      <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded">Login</button>
    </form>
  </div>
</template>
