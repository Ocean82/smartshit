import { useStore } from '@/store/useStore';
import { X, Zap, Search } from 'lucide-react';
import { useState, useMemo } from 'react';

export function SkillsPanel() {
  const { showSkills, toggleSkills, skills, setChatInput, toggleChat, showChat } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = new Set(skills.map((s) => s.category));
    return Array.from(cats);
  }, [skills]);

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      const matchesSearch = !searchTerm ||
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !activeCategory || s.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [skills, searchTerm, activeCategory]);

  if (!showSkills) return null;

  const handleUseSkill = (prompt: string) => {
    if (!showChat) toggleChat();
    setChatInput(prompt);
    setTimeout(() => {
      useStore.getState().sendMessage();
    }, 100);
  };

  return (
    <div className="w-64 border-r border-gray-200 flex flex-col bg-white shrink-0">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap size={14} className="text-amber-500" />
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Skills</h3>
        </div>
        <button
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          onClick={toggleSkills}
        >
          <X size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full text-xs pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-blue-300"
            placeholder="Search skills..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Categories */}
      <div className="px-3 py-2 flex gap-1 flex-wrap border-b border-gray-100">
        <button
          className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
            !activeCategory
              ? 'bg-blue-100 border-blue-200 text-blue-700'
              : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
          }`}
          onClick={() => setActiveCategory(null)}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
              activeCategory === cat
                ? 'bg-blue-100 border-blue-200 text-blue-700'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
            }`}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Skills list */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1.5">
        {filteredSkills.map((skill) => (
          <div
            key={skill.id}
            className="p-2.5 rounded-lg border border-gray-200 hover:border-blue-200 hover:bg-blue-50/30 cursor-pointer transition-all group"
            onClick={() => handleUseSkill(skill.prompt)}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{skill.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-700 group-hover:text-blue-700 truncate">
                  {skill.name}
                </div>
                <div className="text-[10px] text-gray-400 truncate mt-0.5">
                  {skill.description}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{skill.category}</span>
              <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{skill.tools.length === 0 ? 'preset' : `${skill.tools.length} actions`}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
