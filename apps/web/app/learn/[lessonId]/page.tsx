import { notFound } from "next/navigation";
import { loadLesson } from "../../../lib/lessons";
import { LessonRunner } from "../../../components/LessonRunner";
import { completeLessonAction } from "../../actions";
import { getSession } from "../../../lib/auth";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const lesson = loadLesson(lessonId);
  if (!lesson) notFound();

  const user = await getSession();

  return (
    <main>
      <LessonRunner lesson={lesson} onComplete={completeLessonAction.bind(null, lesson.id)} isGuest={!user} />
    </main>
  );
}
