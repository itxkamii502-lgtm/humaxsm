import React, { useState } from 'react';
import { 
  Sparkles, 
  Layers, 
  Code2, 
  Palette, 
  Cpu, 
  Rocket, 
  Zap,
  ArrowRight,
  LayoutDashboard,
  Gamepad2,
  Wand2
} from 'lucide-react';

export default function App() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const projectIdeas = [
    {
      title: 'AI Multi-Tool Dashboard',
      description: 'Document summarizer, tone rewriter, image generator, and smart note organizer.',
      icon: Wand2,
      tag: 'AI Powered',
      color: 'from-blue-500 to-indigo-600',
    },
    {
      title: 'Interactive SaaS Analytics',
      description: 'Real-time metrics, interactive charts, team permissions, and revenue forecasting.',
      icon: LayoutDashboard,
      tag: 'Dashboard',
      color: 'from-emerald-500 to-teal-600',
    },
    {
      title: '2D Physics Canvas & Game',
      description: 'Physics puzzle, particle sand simulator, or arcade platformer with audio & highscores.',
      icon: Gamepad2,
      tag: 'Interactive',
      color: 'from-purple-500 to-pink-600',
    },
    {
      title: 'Creative Design & Canvas Studio',
      description: 'Drag-and-drop vector/card designer, exportable assets, and custom theme builder.',
      icon: Palette,
      tag: 'Creative',
      color: 'from-amber-500 to-orange-600',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-semibold text-base tracking-tight text-white">Creative Studio</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">Ready</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-400">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Dev Server Active</span>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-16 flex flex-col justify-center">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-950/60 border border-indigo-800/40 text-indigo-300 text-xs font-medium mb-6">
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span>Workspace Initialized & Ready to Build</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            What would you like to build today?
          </h1>
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed mb-8">
            Describe any web app, tool, dashboard, game, or interactive prototype.
            I can craft full interfaces, implement business logic, integrate APIs, and style everything to perfection.
          </p>
        </div>

        {/* Feature Grid / Starter Concepts */}
        <div className="mt-4">
          <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-400 mb-4">
            Popular Ideas & Starters
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {projectIdeas.map((idea, index) => {
              const Icon = idea.icon;
              return (
                <div 
                  key={index}
                  className="group relative p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-950/50 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${idea.color} flex items-center justify-center text-white shadow-md`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60">
                        {idea.tag}
                      </span>
                    </div>
                    <h3 className="font-semibold text-slate-100 text-base mb-2 group-hover:text-indigo-300 transition-colors">
                      {idea.title}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {idea.description}
                    </p>
                  </div>
                  <div className="mt-5 pt-3 border-t border-slate-800/60 flex items-center text-xs text-indigo-400 font-medium group-hover:translate-x-1 transition-transform">
                    <span>Ask to build this</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Capabilities quick badges */}
        <div className="mt-12 pt-8 border-t border-slate-900 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-6 flex-wrap">
            <span className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-slate-400" />
              <span>Full React 19 + TypeScript</span>
            </span>
            <span className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-400" />
              <span>Tailwind CSS Styling</span>
            </span>
            <span className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-slate-400" />
              <span>Lucide Icons & Framer Motion</span>
            </span>
          </div>
          <div className="text-slate-400 font-mono text-[11px]">
            Ready for your prompt in chat ↵
          </div>
        </div>
      </main>
    </div>
  );
}
