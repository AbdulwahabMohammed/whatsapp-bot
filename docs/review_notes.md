

---

## 🧠 PR Comments (PR #87)
**Title**: Clear review notes

**Branch**: `codex/delete-contents-of-review_notes.md` &nbsp;&nbsp; 📅 **Date**: 2025-07-30

### 💬 Comment 1 by `qodo-merge-pro[bot]`

## PR Reviewer Guide 🔍

Here are some key observations to aid the review process:

<table>
<tr><td>⏱️&nbsp;<strong>Estimated effort to review</strong>: 1 🔵⚪⚪⚪⚪</td></tr>
<tr><td>🧪&nbsp;<strong>No relevant tests</strong></td></tr>
<tr><td>🔒&nbsp;<strong>No security concerns identified</strong></td></tr>
<tr><td>⚡&nbsp;<strong>No major issues detected</strong></td></tr>
</table>


🔗 [View in GitHub](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/87#issuecomment-3134881644)

---

### 💬 Comment 2 by `qodo-merge-pro[bot]`

## PR Code Suggestions ✨

No code suggestions found for the PR.

🔗 [View in GitHub](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/87#issuecomment-3134881690)

---



---

## 🧠 PR Comments (PR #91)
**Title**: Add Bootstrap layout and update views

**Branch**: `y2uh0z-codex/add-bootstrap-support-to-ejs-layout` &nbsp;&nbsp; 📅 **Date**: 2025-07-30

### 💬 Comment 1 by `qodo-merge-pro[bot]`

## PR Reviewer Guide 🔍

Here are some key observations to aid the review process:

<table>
<tr><td>⏱️&nbsp;<strong>Estimated effort to review</strong>: 2 🔵🔵⚪⚪⚪</td></tr>
<tr><td>🧪&nbsp;<strong>No relevant tests</strong></td></tr>
<tr><td>🔒&nbsp;<strong>Security concerns</strong><br><br>

<strong>CDN Integrity:</strong><br> The Bootstrap CSS and JS files are loaded from CDN with integrity hashes, but these should be verified to match the official Bootstrap 5.3.3 release to prevent potential supply chain attacks. The current integrity values appear to be placeholder-like and should be validated against the official Bootstrap CDN documentation.</td></tr>
<tr><td>⚡&nbsp;<strong>Recommended focus areas for review</strong><br><br>

<details><summary><a href='https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/91/files#diff-476539c094370457814d1c760517f59241b848d82d2d19e188ae4f42adc44cffR7-R37'><strong>CDN Integrity</strong></a>

Bootstrap CDN links use integrity hashes that should be verified for correctness to ensure security and prevent tampering. The current integrity values should be validated against the official Bootstrap CDN.
</summary>

```txt
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-EP9SBmbGnbYT5kP7hZ4AlPfMwVzKhI6+w4n0vUAm8YcL+l9YF8fGZX06xod9W3cT" crossorigin="anonymous">
</head>
<body>
<nav class="navbar navbar-expand-lg navbar-light bg-light mb-4">
  <div class="container-fluid">
    <a class="navbar-brand" href="/">Admin</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="navbarNav">
      <ul class="navbar-nav me-auto mb-2 mb-lg-0">
        <li class="nav-item"><a class="nav-link" href="/profile">Profile</a></li>
        <li class="nav-item"><a class="nav-link" href="/stats">Stats</a></li>
        <li class="nav-item"><a class="nav-link" href="/usage">Usage</a></li>
        <li class="nav-item"><a class="nav-link" href="/analytics">Analytics</a></li>
        <li class="nav-item"><a class="nav-link" href="/dashboard">Dashboard</a></li>
        <li class="nav-item"><a class="nav-link" href="/schedule/new">Schedule</a></li>
        <li class="nav-item"><a class="nav-link" href="/broadcast">Broadcast</a></li>
        <li class="nav-item"><a class="nav-link" href="/unanswered">Unanswered</a></li>
        <li class="nav-item"><a class="nav-link" href="/faq">FAQ</a></li>
      </ul>
      <ul class="navbar-nav">
        <li class="nav-item"><a class="nav-link" href="/logout">Logout</a></li>
      </ul>
    </div>
  </div>
</nav>
<div class="container">
  <%- body %>
</div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-syTdBbYbjS3hjLSeX776BF3nf6/Dr7fP5AnbcW2CYwiVdc+GqOR/mdrDam6DCn8f" crossorigin="anonymous"></script>
```

</details>

<details><summary><a href='https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/91/files#diff-e27bad8c3f971045f5abe2b4346053b1c7f930ad2a87fbd891468a5955d0bde7R26-R27'><strong>Layout Configuration</strong></a>

The express-ejs-layouts middleware is configured after expressWs but before setting the view engine. The order of middleware setup should be verified to ensure proper functionality.
</summary>

```javascript
app.use(expressLayouts);
app.set('layout', 'layout');
```

</details>

</td></tr>
</table>


🔗 [View in GitHub](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/91#issuecomment-3135010066)

---

### 💬 Comment 2 by `qodo-merge-pro[bot]`

## PR Code Suggestions ✨

Explore these optional code suggestions:

<table><thead><tr><td><strong>Category</strong></td><td align=left><strong>Suggestion&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; </strong></td><td align=center><strong>Impact</strong></td></tr><tbody><tr><td rowspan=2>Possible issue</td>
<td>



<details><summary>Fix incorrect Bootstrap CSS integrity hash</summary>

___

**The Bootstrap CSS integrity hash appears to be incorrect for version 5.3.3. This <br>could cause the stylesheet to fail loading due to SRI validation failure. Verify <br>and use the correct integrity hash from the official Bootstrap CDN.**

[views/layout.ejs [7]](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/91/files#diff-476539c094370457814d1c760517f59241b848d82d2d19e188ae4f42adc44cffR7-R7)

```diff
-<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-EP9SBmbGnbYT5kP7hZ4AlPfMwVzKhI6+w4n0vUAm8YcL+l9YF8fGZX06xod9W3cT" crossorigin="anonymous">
+<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
```


- [ ] **Apply / Chat** <!-- /improve --apply_suggestion=0 -->


<details><summary>Suggestion importance[1-10]: 9</summary>

__

Why: The suggestion correctly identifies an incorrect SRI hash for the Bootstrap CSS, which would prevent the stylesheet from loading and break the UI.


</details></details></td><td align=center>High

</td></tr><tr><td>



<details><summary>Fix incorrect Bootstrap JS integrity hash</summary>

___

**The Bootstrap JavaScript integrity hash appears to be incorrect for version <br>5.3.3. This could prevent Bootstrap's JavaScript components from loading <br>properly due to SRI validation failure. Use the correct integrity hash from the <br>official Bootstrap CDN.**

[views/layout.ejs [37]](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/91/files#diff-476539c094370457814d1c760517f59241b848d82d2d19e188ae4f42adc44cffR37-R37)

```diff
-<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-syTdBbYbjS3hjLSeX776BF3nf6/Dr7fP5AnbcW2CYwiVdc+GqOR/mdrDam6DCn8f" crossorigin="anonymous"></script>
+<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz" crossorigin="anonymous"></script>
```


- [ ] **Apply / Chat** <!-- /improve --apply_suggestion=1 -->


<details><summary>Suggestion importance[1-10]: 9</summary>

__

Why: The suggestion correctly identifies an incorrect SRI hash for the Bootstrap JS bundle, which would prevent it from loading and break JavaScript-dependent components.


</details></details></td><td align=center>High

</td></tr><tr><td rowspan=1>General</td>
<td>



<details><summary>Reorder middleware configuration for proper setup</summary>

___

**The <code>expressLayouts</code> middleware should be configured after setting the view engine <br>and views directory to ensure proper template resolution. Moving these lines <br>after the existing view configuration will prevent potential rendering issues.**

[src/admin.js [26-27]](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/91/files#diff-e27bad8c3f971045f5abe2b4346053b1c7f930ad2a87fbd891468a5955d0bde7R26-R27)

```diff
+app.set('view engine', 'ejs');
+app.set('views', path.join(__dirname, '../views'));
 app.use(expressLayouts);
 app.set('layout', 'layout');
```


- [ ] **Apply / Chat** <!-- /improve --apply_suggestion=2 -->


<details><summary>Suggestion importance[1-10]: 7</summary>

__

Why: The suggestion correctly points out that `express-ejs-layouts` setup should follow view engine configuration, which is a best practice for Express applications.


</details></details></td><td align=center>Medium

</td></tr>
<tr><td align="center" colspan="2">

- [ ] More <!-- /improve --more_suggestions=true -->

</td><td></td></tr></tbody></table>

🔗 [View in GitHub](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/91#issuecomment-3135012189)

---



---

## 🧠 PR Comments (PR #92)
**Title**: Add header and footer partials

**Branch**: `codex/create-header-and-footer-partials` &nbsp;&nbsp; 📅 **Date**: 2025-07-30

### 💬 Comment 1 by `qodo-merge-pro[bot]`

## PR Reviewer Guide 🔍

Here are some key observations to aid the review process:

<table>
<tr><td>⏱️&nbsp;<strong>Estimated effort to review</strong>: 2 🔵🔵⚪⚪⚪</td></tr>
<tr><td>🧪&nbsp;<strong>No relevant tests</strong></td></tr>
<tr><td>🔒&nbsp;<strong>No security concerns identified</strong></td></tr>
<tr><td>⚡&nbsp;<strong>Recommended focus areas for review</strong><br><br>

<details><summary><a href='https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/92/files#diff-482769c023affc08414f4927472243199c2f01e2bc36d41b949752bc6642685fR34-R35'><strong>Missing Closing</strong></a>

The header partial opens a container div but relies on the footer partial to close it, creating a tight coupling between partials that could lead to HTML structure issues if one partial is modified independently.
</summary>

```txt
<div class="container">

```

</details>

<details><summary><a href='https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/92/files#diff-92f5de8ab591ca7b6e7fc2297ffb5335d4d0b7f6fa3d37d99ab0b42a2215b394R1-R1'><strong>Structural Dependency</strong></a>

The footer partial closes a div that was opened in the header partial, creating an implicit dependency that makes the partials less modular and harder to maintain independently.
</summary>

```txt
</div>
<footer class="text-center mt-4 mb-3">
```

</details>

</td></tr>
</table>


🔗 [View in GitHub](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/92#issuecomment-3135021122)

---

### 💬 Comment 2 by `qodo-merge-pro[bot]`

## PR Code Suggestions ✨

Explore these optional code suggestions:

<table><thead><tr><td><strong>Category</strong></td><td align=left><strong>Suggestion&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; </strong></td><td align=center><strong>Impact</strong></td></tr><tbody><tr><td rowspan=2>General</td>
<td>



<details><summary>Make page title dynamic</summary>

___

**The hardcoded title should be dynamic to allow different pages to have specific <br>titles. Consider accepting a title variable from the parent template.**

[views/partials/header.ejs [6]](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/92/files#diff-482769c023affc08414f4927472243199c2f01e2bc36d41b949752bc6642685fR6-R6)

```diff
-<title>WhatsApp Bot Admin</title>
+<title><%= typeof title !== 'undefined' ? title : 'WhatsApp Bot Admin' %></title>
```


- [ ] **Apply / Chat** <!-- /improve --apply_suggestion=0 -->


<details><summary>Suggestion importance[1-10]: 7</summary>

__

Why: The suggestion correctly identifies that a hardcoded title in a shared header partial is inflexible and proposes a good solution to make it dynamic for different pages.


</details></details></td><td align=center>Medium

</td></tr><tr><td>



<details><summary>Make container closure conditional</summary>

___

**The closing <code></div></code> tag assumes the header always opens a container div, creating tight <br>coupling between partials. Consider moving the container div management to <br>individual pages or making it conditional.**

[views/partials/footer.ejs [1-4]](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/92/files#diff-92f5de8ab591ca7b6e7fc2297ffb5335d4d0b7f6fa3d37d99ab0b42a2215b394R1-R4)

```diff
+<% if (typeof closeContainer === 'undefined' || closeContainer) { %>
 </div>
+<% } %>
 <footer class="text-center mt-4 mb-3">
   <small>&copy; <%= new Date().getFullYear() %> WhatsApp Bot</small>
 </footer>
```


- [ ] **Apply / Chat** <!-- /improve --apply_suggestion=1 -->


<details><summary>Suggestion importance[1-10]: 7</summary>

__

Why: The suggestion correctly identifies tight coupling between the header and footer partials due to the container `div` and proposes a good solution to increase layout flexibility.


</details></details></td><td align=center>Medium

</td></tr>
<tr><td align="center" colspan="2">

- [ ] More <!-- /improve --more_suggestions=true -->

</td><td></td></tr></tbody></table>

🔗 [View in GitHub](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/92#issuecomment-3135022250)

---



---

## 🧠 PR Comments (PR #93)
**Title**: Enhance admin UI with confirmations and alerts

**Branch**: `codex/enhance-user-experience-with-javascript` &nbsp;&nbsp; 📅 **Date**: 2025-07-30

### 💬 Comment 1 by `qodo-merge-pro[bot]`

## PR Reviewer Guide 🔍

Here are some key observations to aid the review process:

<table>
<tr><td>⏱️&nbsp;<strong>Estimated effort to review</strong>: 2 🔵🔵⚪⚪⚪</td></tr>
<tr><td>🧪&nbsp;<strong>No relevant tests</strong></td></tr>
<tr><td>🔒&nbsp;<strong>No security concerns identified</strong></td></tr>
<tr><td>⚡&nbsp;<strong>Recommended focus areas for review</strong><br><br>

<details><summary><a href='https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/93/files#diff-b69ac8622add25c4bf680301d8606e434250432069f023049004a6c3a68b22d5R11-R23'><strong>Error Handling</strong></a>

The AJAX upload implementation lacks proper error handling for network failures or server errors. If the fetch request fails or returns a non-200 status, the code will throw an unhandled exception when trying to parse JSON.
</summary>

```txt
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = new URLSearchParams(new FormData(form));
  const res = await fetch(form.action, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: data
  });
  const result = await res.json();
  const alert = document.getElementById('uploadAlert');
  alert.innerHTML = `<div class="alert alert-success alert-dismissible fade show" role="alert">${result.message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>`;
});
```

</details>

<details><summary><a href='https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/93/files#diff-e27bad8c3f971045f5abe2b4346053b1c7f930ad2a87fbd891468a5955d0bde7R277-R279'><strong>Content Type</strong></a>

The JSON response detection relies on checking the Accept header for exact match with 'application/json', but browsers typically send multiple content types. This could cause the JSON response path to be missed in some cases.
</summary>

```javascript
if (req.headers.accept === 'application/json') {
  return res.json({ ok: true, message: 'File uploaded' });
}
```

</details>

</td></tr>
</table>


🔗 [View in GitHub](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/93#issuecomment-3135040789)

---

### 💬 Comment 2 by `qodo-merge-pro[bot]`

## PR Code Suggestions ✨

Explore these optional code suggestions:

<table><thead><tr><td><strong>Category</strong></td><td align=left><strong>Suggestion&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; </strong></td><td align=center><strong>Impact</strong></td></tr><tbody><tr><td rowspan=2>Security</td>
<td>



<details><summary>Escape alert message content</summary>

___

**Escape the <code>alert.message</code> content to prevent XSS attacks. User-controlled data <br>should be HTML-escaped when rendered in templates to prevent malicious script <br>injection.**

[views/partials/header.ejs [35-40]](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/93/files#diff-482769c023affc08414f4927472243199c2f01e2bc36d41b949752bc6642685fR35-R40)

```diff
 <% if (alert) { %>
 <div class="alert alert-<%= alert.type %> alert-dismissible fade show" role="alert">
-  <%= alert.message %>
+  <%- alert.message %>
   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
 </div>
 <% } %>
```


- [ ] **Apply / Chat** <!-- /improve --apply_suggestion=0 -->


<details><summary>Suggestion importance[1-10]: 9</summary>

__

Why: The suggestion correctly identifies a potential XSS vulnerability by using `<%= alert.message %>` which does not escape HTML, and correctly proposes using `<%- alert.message %>` to mitigate it.


</details></details></td><td align=center>High

</td></tr><tr><td>



<details><summary>Prevent XSS in alert message</summary>

___

**Use <code>textContent</code> or properly escape the <code>result.message</code> to prevent XSS attacks. <br>Setting <code>innerHTML</code> with unescaped user data can allow script injection if the <br>message contains malicious content.**

[views/upload.ejs [22]](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/93/files#diff-b69ac8622add25c4bf680301d8606e434250432069f023049004a6c3a68b22d5R22-R22)

```diff
-alert.innerHTML = `<div class="alert alert-success alert-dismissible fade show" role="alert">${result.message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>`;
+const alertDiv = document.createElement('div');
+alertDiv.className = 'alert alert-success alert-dismissible fade show';
+alertDiv.setAttribute('role', 'alert');
+alertDiv.textContent = result.message;
+const closeBtn = document.createElement('button');
+closeBtn.type = 'button';
+closeBtn.className = 'btn-close';
+closeBtn.setAttribute('data-bs-dismiss', 'alert');
+closeBtn.setAttribute('aria-label', 'Close');
+alertDiv.appendChild(closeBtn);
+alert.innerHTML = '';
+alert.appendChild(alertDiv);
```


- [ ] **Apply / Chat** <!-- /improve --apply_suggestion=1 -->


<details><summary>Suggestion importance[1-10]: 9</summary>

__

Why: The suggestion correctly identifies a potential XSS vulnerability by using `innerHTML` with unescaped data from `result.message`, which could lead to script injection.


</details></details></td><td align=center>High

</td></tr><tr><td rowspan=1>Possible issue</td>
<td>



<details><summary>Add error handling for fetch</summary>

___

**Add error handling for the fetch request to handle network failures and non-200 <br>responses. Without error handling, the application will crash if the request <br>fails or returns an error status.**

[views/upload.ejs [11-23]](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/93/files#diff-b69ac8622add25c4bf680301d8606e434250432069f023049004a6c3a68b22d5R11-R23)

```diff
 document.getElementById('uploadForm').addEventListener('submit', async (e) => {
   e.preventDefault();
   const form = e.target;
   const data = new URLSearchParams(new FormData(form));
-  const res = await fetch(form.action, {
-    method: 'POST',
-    headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
-    body: data
-  });
-  const result = await res.json();
-  const alert = document.getElementById('uploadAlert');
-  alert.innerHTML = `<div class="alert alert-success alert-dismissible fade show" role="alert">${result.message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>`;
+  try {
+    const res = await fetch(form.action, {
+      method: 'POST',
+      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
+      body: data
+    });
+    if (!res.ok) throw new Error(`HTTP ${res.status}`);
+    const result = await res.json();
+    const alert = document.getElementById('uploadAlert');
+    alert.innerHTML = `<div class="alert alert-success alert-dismissible fade show" role="alert">${result.message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>`;
+  } catch (error) {
+    const alert = document.getElementById('uploadAlert');
+    alert.innerHTML = `<div class="alert alert-danger alert-dismissible fade show" role="alert">Upload failed. Please try again.<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>`;
+  }
 });
```


- [ ] **Apply / Chat** <!-- /improve --apply_suggestion=2 -->


<details><summary>Suggestion importance[1-10]: 7</summary>

__

Why: The suggestion correctly identifies a lack of error handling for the `fetch` call, and the proposed `try...catch` block improves robustness by handling network errors and non-successful HTTP responses.


</details></details></td><td align=center>Medium

</td></tr>
<tr><td align="center" colspan="2">

- [ ] More <!-- /improve --more_suggestions=true -->

</td><td></td></tr></tbody></table>

🔗 [View in GitHub](https://github.com/AbdulwahabMohammed/whatsapp-bot/pull/93#issuecomment-3135042336)

---

