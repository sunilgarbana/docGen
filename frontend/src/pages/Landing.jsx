import React from 'react';

const Landing = () => {
  return (
    <div className="min-h-screen flex flex-col bg-gray-900 text-white font-sans">
      {/* Navbar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="text-2xl font-bold text-white tracking-tight">
          DocGen
        </div>
        <div className="space-x-4">
          <a href="http://localhost:5000/api/auth/github" className="text-gray-300 hover:text-white transition-colors">
            Login
          </a>
          <a href="http://localhost:5000/api/auth/github" className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2 rounded-md font-medium transition-colors inline-block">
            Get Started
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-grow flex flex-col items-center justify-center px-4 text-center py-20">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 mt-8 max-w-4xl">
          Auto-generate docs from your codebase
        </h1>
        <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mb-12">
          Paste a GitHub repo URL and get beautiful, always-up-to-date documentation in seconds.
        </p>
        <button className="bg-purple-600 hover:bg-purple-500 text-white text-lg px-8 py-4 rounded-md font-medium shadow-lg shadow-purple-500/30 transition-all transform hover:-translate-y-1">
          Try it free
        </button>

        {/* Features Section */}
        <section className="mt-32 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 w-full px-4 mb-20">
          <div className="bg-gray-800/50 p-8 rounded-xl border border-gray-700 hover:border-purple-500/50 transition-colors">
            <h3 className="text-xl font-bold mb-3 text-purple-400">Git-aware</h3>
            <p className="text-gray-400">
              Seamlessly integrates with your Git workflow. Pushes to main automatically update your documentation site.
            </p>
          </div>
          <div className="bg-gray-800/50 p-8 rounded-xl border border-gray-700 hover:border-purple-500/50 transition-colors">
            <h3 className="text-xl font-bold mb-3 text-purple-400">Multi-format output</h3>
            <p className="text-gray-400">
              Export your docs in Markdown, HTML, or even PDF format. Perfectly tailored for your audience.
            </p>
          </div>
          <div className="bg-gray-800/50 p-8 rounded-xl border border-gray-700 hover:border-purple-500/50 transition-colors">
            <h3 className="text-xl font-bold mb-3 text-purple-400">CI/CD ready</h3>
            <p className="text-gray-400">
              Easy setup in GitHub Actions, GitLab CI, or any CI/CD pipeline. DocGen runs where you work.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 text-center text-gray-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center">
          <p>&copy; {new Date().getFullYear()} DocGen. All rights reserved.</p>
          <div className="space-x-6 mt-4 md:mt-0">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
