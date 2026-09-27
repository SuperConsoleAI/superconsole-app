# Composio Instagram Publishing Flow

This document details the exact sequence of API calls required to post to Instagram Business/Creator accounts via the Composio API. 

Because Composio manages the OAuth connection but some of their built-in UI tools might be disabled or deprecated, the most reliable way to post is a hybrid approach: using Composio's specialized tools where possible, and securely proxying raw Instagram Graph API requests where needed.

## Prerequisites
- A valid **Project API Key** (`x-api-key`) from your Composio Dashboard.
- The **Connected Account ID** (`connected_account_id`) or **Entity ID** (`entity_id`) of the user who connected their Instagram account.

---

### Step 1: Fetch the Instagram User ID (`ig_user_id`)
You must know the user's Meta Graph API `ig_user_id` to post on their behalf. If you don't already have it stored in your database, you can fetch it dynamically by proxying a request to Instagram's `/me` endpoint.

```bash
curl -X POST "https://backend.composio.dev/api/v3.1/tools/execute/proxy" \
-H "x-api-key: YOUR_PROJECT_API_KEY" \
-H "Content-Type: application/json" \
-d '{
  "connected_account_id": "YOUR_CONNECTED_ACCOUNT_ID",
  "endpoint": "https://graph.instagram.com/v21.0/me?fields=id,username",
  "method": "GET"
}'
```
**Response Details:**
The response will contain `"data": {"id": "28600...", "username": "..."}`. Save this `id` as your `ig_user_id`.

---

### Step 2: Create a Media Container
Instagram's Graph API requires a two-step process for publishing media. First, you create a "Container" which allows Meta to download and process the image/video.

We can use Composio's native tool for this:

```bash
curl -X POST "https://backend.composio.dev/api/v3/tools/execute/INSTAGRAM_CREATE_MEDIA_CONTAINER" \
-H "x-api-key: YOUR_PROJECT_API_KEY" \
-H "Content-Type: application/json" \
-d '{
  "connected_account_id": "YOUR_CONNECTED_ACCOUNT_ID",
  "arguments": {
    "ig_user_id": "THE_ID_FROM_STEP_1",
    "image_url": "https://example.com/your-image.jpg",
    "caption": "Your post caption! 🚀"
  }
}'
```
**Response Details:**
The response will contain `"data": {"id": "18107..."}`. Save this `id` as the `creation_id`.

---

### Step 3: Publish the Media Container
Once the container is created, you must explicitly publish it to the user's feed. Since the native publish tool is sometimes restricted, proxying the request directly to the Graph API guarantees success.

*Note: The `creation_id` MUST be passed as a URL query parameter in the `endpoint` string, not in a JSON body.*

```bash
curl -X POST "https://backend.composio.dev/api/v3.1/tools/execute/proxy" \
-H "x-api-key: YOUR_PROJECT_API_KEY" \
-H "Content-Type: application/json" \
-d '{
  "connected_account_id": "YOUR_CONNECTED_ACCOUNT_ID",
  "endpoint": "https://graph.instagram.com/v21.0/THE_ID_FROM_STEP_1/media_publish?creation_id=THE_CREATION_ID_FROM_STEP_2",
  "method": "POST"
}'
```

**Response Details:**
If successful, it returns `"data":{"id":"<Published_Post_ID>"}` with an HTTP 200 status. The post is now live on the Instagram feed!
