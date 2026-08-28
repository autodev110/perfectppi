export function buildQuestionOrder(
  questionIds: string[],
  deferredQuestionIds: string[]
) {
  const questionIdSet = new Set(questionIds);
  const validDeferred = deferredQuestionIds.filter((id) => questionIdSet.has(id));
  const deferredSet = new Set(validDeferred);

  return [
    ...questionIds.filter((id) => !deferredSet.has(id)),
    ...validDeferred,
  ];
}

export function deferQuestion(
  questionIds: string[],
  deferredQuestionIds: string[],
  currentQuestionId: string
) {
  const currentOrder = buildQuestionOrder(questionIds, deferredQuestionIds);
  const currentIndex = currentOrder.indexOf(currentQuestionId);
  const nextQuestionId = currentOrder[currentIndex + 1] ?? null;

  if (currentIndex < 0 || !nextQuestionId) {
    return { deferredQuestionIds, nextQuestionId: null };
  }

  return {
    deferredQuestionIds: [
      ...deferredQuestionIds.filter((id) => id !== currentQuestionId),
      currentQuestionId,
    ],
    nextQuestionId,
  };
}
