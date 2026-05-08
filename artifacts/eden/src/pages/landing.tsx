import { motion, useScroll } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  Sparkles, 
  ChevronRight, 
  Zap, 
  Brain, 
  Database, 
  ArrowRight, 
  Layers, 
  MessageSquare, 
  Globe,
  Share2,
  Lock
} from "lucide-react";
import { useRef } from "react";

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  return (
    <div ref={containerRef} className="min-h-screen bg-background text-foreground selection:bg-primary/30 overflow-x-hidden scroll-smooth">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-border/50 bg-background/95 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">Eden</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-primary transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-primary transition-colors">Workflow</a>
            <a href="#integrations" className="hover:text-primary transition-colors">Integrations</a>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground">Log in</Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 shadow-lg shadow-primary/20">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-32 px-6 overflow-hidden">
        {/* Animated Background Orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 pointer-events-none">
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.2, 0.3, 0.2],
            }}
            transition={{ duration: 8, repeat: Infinity }}
            className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/30 blur-[120px] rounded-full" 
          />
          <motion.div 
            animate={{ 
              scale: [1, 1.1, 1],
              opacity: [0.1, 0.2, 0.1],
            }}
            transition={{ duration: 10, repeat: Infinity, delay: 1 }}
            className="absolute bottom-[10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 blur-[100px] rounded-full" 
          />
        </div>

        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-[11px] uppercase font-bold tracking-widest text-primary mb-8 shadow-sm">
              <Zap className="w-3 h-3 fill-primary" />
              <span>The Next Generation of Workspace</span>
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.9]"
          >
            Organize your chaos.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-emerald-500 to-primary animate-gradient-x italic font-serif">Perfectly.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-12 leading-relaxed font-medium"
          >
            Eden is more than just a notebook. It's an intelligent agent that reads your sources, 
            organizes your thoughts, and automates your workflows.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-6"
          >
            <Link href="/signup">
              <Button size="lg" className="h-16 px-10 text-xl rounded-full bg-primary hover:bg-primary/90 text-primary-foreground group shadow-[0_20px_50px_rgba(var(--primary),0.3)] transition-all hover:-translate-y-1">
                Start building your Eden
                <ChevronRight className="ml-2 w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <div className="flex -space-x-3 items-center">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-background bg-muted flex items-center justify-center overflow-hidden">
                  <img src={`https://i.pravatar.cc/40?img=${i+10}`} alt="User" />
                </div>
              ))}
              <span className="ml-6 text-sm font-medium text-muted-foreground">Joined by 2k+ creators</span>
            </div>
          </motion.div>

          {/* Hero Mockup with Storytelling Overlay */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.8 }}
            className="mt-24 relative mx-auto max-w-6xl group px-4"
          >
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-emerald-600/20 rounded-[2.5rem] blur-2xl opacity-50 group-hover:opacity-100 transition duration-1000" />
            <div className="relative rounded-[2rem] border border-white/10 bg-black/40 backdrop-blur shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden aspect-[16/10] ring-1 ring-white/20">
              <img 
                src="/eden_hero_mockup_1778091794881.png" 
                alt="Eden Workspace" 
                className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
              />
              
              {/* Floating Story Elements */}
              <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute top-[15%] right-[10%] p-4 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl hidden md:block"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Auto-Task</p>
                    <p className="text-xs font-semibold text-white">Generating meeting minutes...</p>
                  </div>
                </div>
              </motion.div>

              <motion.div 
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 5, repeat: Infinity, delay: 0.5 }}
                className="absolute bottom-[20%] left-[5%] p-4 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl hidden md:block"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Database className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Ingestion</p>
                    <p className="text-xs font-semibold text-white">Syncing from Dropbox...</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Narrative Section: The Flow */}
      <section id="how-it-works" className="py-32 bg-muted/30 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">How your Eden grows</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">From scattered thoughts to a structured powerhouse.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-16 relative">
            {/* Connection Lines (Desktop) */}
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-border to-transparent -translate-y-1/2 -z-10" />

            <Step 
              number="01"
              title="Connect Sources"
              description="Upload files, sync cloud drives, or just paste links. Eden ingests everything instantly."
              icon={<Globe className="w-8 h-8" />}
              color="text-teal-500"
            />
            <Step 
              number="02"
              title="AI Organizes"
              description="Our agents automatically tag, summarize, and file your content into your workspace."
              icon={<Brain className="w-8 h-8" />}
              color="text-emerald-500"
            />
            <Step 
              number="03"
              title="Automate Workflows"
              description="Trigger custom AI pipelines. Sync notes to Notion, generate reports, or create tasks."
              icon={<Zap className="w-8 h-8" />}
              color="text-primary"
            />
          </div>
        </div>
      </section>

      {/* Feature Showcase */}
      <section id="features" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center mb-32">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h3 className="text-4xl font-bold mb-6 tracking-tight">Semantic Search that actually finds stuff.</h3>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                Stop looking for "that one pdf from march". Ask Eden "What did we decide about the roadmap?" 
                and get an instant answer sourced from your documents.
              </p>
              <ul className="space-y-4">
                <li className="flex items-center gap-3 text-lg font-medium">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-primary" />
                  </div>
                  Vector-powered embeddings
                </li>
                <li className="flex items-center gap-3 text-lg font-medium">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-primary" />
                  </div>
                  Context-aware chat
                </li>
              </ul>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative aspect-square bg-gradient-to-br from-primary/5 to-purple-600/5 rounded-[3rem] border border-border/50 flex items-center justify-center overflow-hidden group"
            >
              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
              <div className="relative p-12 w-full h-full flex flex-col justify-center gap-4">
                <div className="p-4 rounded-2xl bg-card border border-border shadow-xl transform group-hover:scale-105 transition-transform">
                  <div className="flex gap-3 mb-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  <p className="text-sm font-mono text-muted-foreground">Search: "project strategy"</p>
                </div>
                <div className="p-4 rounded-2xl bg-primary text-primary-foreground shadow-2xl ml-8 transform translate-y-4 group-hover:translate-y-2 transition-transform">
                  <p className="text-sm font-medium">Found 3 relevant chunks in 'Q3 Planning.pdf' and 'Email Thread'</p>
                </div>
              </div>
            </motion.div>
          </div>

          <div id="integrations" className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="order-2 lg:order-1 relative aspect-square bg-gradient-to-br from-purple-600/5 to-primary/5 rounded-[3rem] border border-border/50 flex items-center justify-center overflow-hidden"
            >
              <div className="relative p-12 w-full h-full flex items-center justify-center">
                <div className="grid grid-cols-2 gap-4">
                  <IntegrationsIcon icon={<Globe />} label="Web" />
                  <IntegrationsIcon icon={<Database />} label="Drives" />
                  <IntegrationsIcon icon={<Share2 />} label="Social" />
                  <IntegrationsIcon icon={<MessageSquare />} label="Chat" />
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="order-1 lg:order-2"
            >
              <h3 className="text-4xl font-bold mb-6 tracking-tight">Autonomous Agents at your service.</h3>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                Assign an agent to a folder. It will watch for new files, read them, and perform tasks 
                like tagging, organizing, or even notifying your team on Slack.
              </p>
              <div className="grid grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl bg-muted/50 border border-border">
                  <Layers className="w-8 h-8 text-primary mb-4" />
                  <h4 className="font-bold mb-2">Multi-Agent</h4>
                  <p className="text-sm text-muted-foreground">Run multiple specialized agents simultaneously.</p>
                </div>
                <div className="p-6 rounded-2xl bg-muted/50 border border-border">
                  <Lock className="w-8 h-8 text-primary mb-4" />
                  <h4 className="font-bold mb-2">Strict Privacy</h4>
                  <p className="text-sm text-muted-foreground">Agents only see what you give them access to.</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5 -z-10" />
        <div className="max-w-4xl mx-auto text-center">
          <motion.h2 
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="text-5xl md:text-7xl font-bold mb-10 tracking-tight"
          >
            Ready to build your <span className="text-primary">Eden?</span>
          </motion.h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link href="/signup">
              <Button size="lg" className="h-16 px-12 text-xl rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xl shadow-primary/30">
                Join the Private Beta
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="h-16 px-12 text-xl rounded-full">
                View Demo
              </Button>
            </Link>
          </div>
          <p className="mt-8 text-muted-foreground font-medium">Free for individuals during beta. No credit card required.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-border/50">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12 mb-20">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl tracking-tight">Eden</span>
            </div>
            <p className="text-muted-foreground max-w-sm mb-6 leading-relaxed">
              Designing the future of human-AI collaboration. Eden is your autonomous 
              workspace for research, writing, and automation.
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-6">Product</h4>
            <ul className="space-y-4 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary">Features</a></li>
              <li><a href="#" className="hover:text-primary">Integrations</a></li>
              <li><a href="#" className="hover:text-primary">Pricing</a></li>
              <li><a href="#" className="hover:text-primary">Changelog</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-6">Company</h4>
            <ul className="space-y-4 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary">About</a></li>
              <li><a href="#" className="hover:text-primary">Privacy</a></li>
              <li><a href="#" className="hover:text-primary">Terms</a></li>
              <li><a href="#" className="hover:text-primary">Contact</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between pt-12 border-t border-border/50 text-muted-foreground text-sm gap-6">
          <p>© {new Date().getFullYear()} Eden AI. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-primary transition-colors">Twitter</a>
            <a href="#" className="hover:text-primary transition-colors">LinkedIn</a>
            <a href="#" className="hover:text-primary transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Step({ number, title, description, icon, color }: { number: string, title: string, description: string, icon: React.ReactNode, color: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="flex flex-col items-center text-center group"
    >
      <div className={`w-20 h-20 rounded-[2rem] bg-card border border-border shadow-xl flex items-center justify-center mb-8 transform group-hover:scale-110 transition-transform duration-500 relative`}>
        <div className={`absolute -top-3 -right-3 w-10 h-10 rounded-full bg-background border border-border flex items-center justify-center text-xs font-black ${color} shadow-lg`}>
          {number}
        </div>
        <div className={color}>
          {icon}
        </div>
      </div>
      <h3 className="text-2xl font-bold mb-4">{title}</h3>
      <p className="text-muted-foreground leading-relaxed px-4">{description}</p>
    </motion.div>
  );
}

function IntegrationsIcon({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 p-8 rounded-3xl bg-card border border-border shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1">
      <div className="w-12 h-12 text-primary">
        {icon}
      </div>
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
    </div>
  );
}
