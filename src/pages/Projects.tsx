import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Header } from "../components/Header";
import { PrimaryButton } from "../components/Buttons";
import { ProjectCard, type ProjectStatus } from "../components/ProjectCard";
import { useRouter } from "../lib/router";
import { STAGE_LABEL, projectName, stageStatus, updatedLabel } from "../lib/stages";

/**
 * Your logos (Figma "Projects" frames 5563:11754, :11915, :12076): every
 * project the signed-in person owns, most recently touched first.
 */
export type ProjectSummary = {
  id: string;
  brandName: string;
  stageLabel: string;
  status: ProjectStatus;
  updatedLabel: string;
  markUrl: string | null;
};

export function Projects() {
  const projects = useQuery(api.projects.list);
  const create = useMutation(api.projects.create);
  const { navigate } = useRouter();

  async function startNew() {
    const projectId = await create();
    navigate(`/studio/${projectId}`);
  }

  return (
    <ProjectsView
      onNew={startNew}
      projects={(projects ?? []).map((project) => ({
        id: project._id,
        brandName: projectName(project.brandName),
        stageLabel: STAGE_LABEL[project.stage],
        status: stageStatus(project.stage),
        updatedLabel: updatedLabel(project.updatedAt),
        markUrl: project.latestMarkUrl,
      }))}
    />
  );
}

export function ProjectsView({ projects, onNew }: { projects: ProjectSummary[]; onNew: () => void }) {
  return (
    <div className="relative flex min-h-full w-full flex-col items-start bg-background-2-light dark:bg-background-1-dark" data-name="Projects">
      <Header state="signedIn" context="Your logos" />
      <main className="relative flex w-full shrink-0 flex-col items-center px-[16px] pb-[48px] pt-[32px] desktop:px-[24px] desktop:pb-[80px] desktop:pt-[56px]" data-name="body">
        <div className="relative flex w-full max-w-full shrink-0 flex-col items-start gap-[32px] desktop:w-[1040px]" data-name="column">
          <div className="relative flex w-full shrink-0 flex-col items-start gap-[16px] desktop:flex-row desktop:items-center desktop:justify-between" data-name="top">
            <h1 className="type-h1-l shrink-0 whitespace-nowrap text-headline-2-light dark:text-headline-2-dark">Your logos</h1>
            <PrimaryButton onClick={onNew} className="w-full desktop:w-[280px]">
              New logo
            </PrimaryButton>
          </div>
          <div className="relative flex w-full shrink-0 flex-col items-start gap-[16px] desktop:flex-row desktop:flex-wrap desktop:content-start desktop:gap-x-[40px] desktop:gap-y-[32px]" data-name="projects">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                to={`/studio/${project.id}`}
                brandName={project.brandName}
                stageLabel={project.stageLabel}
                status={project.status}
                updatedLabel={project.updatedLabel}
                markUrl={project.markUrl}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
