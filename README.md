<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/b481730b-2871-4dec-9f36-2f4fecda65ba

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## 🚀 Deploy Configuration (Vercel)

After pushing to GitHub, Vercel will automatically deploy your app. However, you MUST configure the environment variables:

### Required Environment Variables

1. **OPENAI_API_KEY** - Get it from [OpenAI Platform](https://platform.openai.com/api-keys)

2. ### How to Configure on Vercel:

3. 1. Go to your project dashboard on [Vercel](https://vercel.com/dashboard)
   2. 2. Click on your OSONE2 project
      3. 3. Go to **Settings** → **Environment Variables**
         4. 4. Add a new environment variable:
            5.    - Name: `OPENAI_API_KEY`
                  -    - Value: Your OpenAI API key
                       - 5. Click "Save"
                         6. 6. Vercel will automatically trigger a new deployment
                           
                            7. Once the deployment is complete, test the audio search feature on your site!
