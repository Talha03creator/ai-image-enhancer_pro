# AI-Powered Image & Video Enhancer

A next-generation, full-stack web application designed to enhance visual content using advanced AI algorithms. This platform provides a seamless, secure, and high-performance experience for users to transform their images and videos with professional-grade quality.

## 🚀 Key Features

- **Advanced AI Enhancement:** Leverage state-of-the-art AI models to upscale, de-noise, and color-correct images and videos.
- **Secure Authentication:** Robust, in-app Email/Password authentication system with session isolation and "Remember Me" functionality.
- **Real-time History Sync:** Automatically synchronize your enhancement history across devices using a secure Firestore backend.
- **Interactive UI:** A modern, responsive dashboard built with React and Tailwind CSS, featuring smooth animations powered by Framer Motion.
- **Multi-User Support:** Each user has a private, isolated environment with strict Role-Based Access Control (RBAC).

## 🛡️ Security Architecture

This project is built with a "Security-First" mindset:

- **Firestore Security Rules:** Implements a "Default Deny" policy with granular, ownership-based access control and strict schema validation.
- **Data Integrity:** All user inputs are sanitized and validated for format and size to prevent DoS and injection attacks.
- **Secure Auth Flow:** Custom, modal-based authentication ensures that sensitive credentials never leave the secure app context.
- **RBAC:** Administrative features are strictly isolated from regular user accounts.

## 🛠️ Tech Stack

- **Frontend:** React 18+, TypeScript, Tailwind CSS, Lucide React, Framer Motion.
- **Backend:** Node.js, Express (Full-Stack integration).
- **Database & Auth:** Firebase (Firestore, Firebase Auth).
- **Build Tool:** Vite.

## 📦 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Talha03creator/AI-Powered-Image-Enhancer.git
   cd AI-Powered-Image-Enhancer
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your Firebase and API configuration (see `.env.example` for reference).

4. **Firebase Setup:**
   - Enable **Email/Password** authentication in the Firebase Console.
   - Deploy the provided `firestore.rules` to your Firestore instance.

5. **Run the development server:**
   ```bash
   npm run dev
   ```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Built with ❤️ by Talha*
