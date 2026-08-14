import { notFound } from "next/navigation";
import { loadLesson } from "../../../lib/lessons";
import { LessonRunner } from "../../../components/LessonRunner";
import { completeLessonAction } from "../../actions";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const lesson = loadLesson(lessonId);
  if (!lesson) notFound();

  return (
    <main>
      <LessonRunner lesson={lesson} onComplete={completeLessonAction.bind(null, lesson.id)} />
    </main>
  );
}
