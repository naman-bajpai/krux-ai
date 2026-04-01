"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

interface ProjectCtx {
  projectId: string | null;
  projectName: string | null;
  setProject: (id: string, name: string) => void;
  clearProject: () => void;
}

const Ctx = createContext<ProjectCtx>({
  projectId: null,
  projectName: null,
  setProject: () => {},
  clearProject: () => {},
});

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);

  // Rehydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("krux_project");
      if (raw) {
        const { id, name } = JSON.parse(raw);
        setProjectId(id);
        setProjectName(name);
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  const setProject = useCallback((id: string, name: string) => {
    setProjectId(id);
    setProjectName(name);
    localStorage.setItem("krux_project", JSON.stringify({ id, name }));
  }, []);

  const clearProject = useCallback(() => {
    setProjectId(null);
    setProjectName(null);
    localStorage.removeItem("krux_project");
  }, []);

  return (
    <Ctx.Provider value={{ projectId, projectName, setProject, clearProject }}>
      {children}
    </Ctx.Provider>
  );
}

export function useProject() {
  return useContext(Ctx);
}
