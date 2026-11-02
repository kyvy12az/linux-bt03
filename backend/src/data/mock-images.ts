const subjects = [
  "black dog",
  "red hat",
  "green apple",
  "white rabbit",
  "blue butterfly",
  "yellow flower",
  "brown horse",
  "orange fish",
  "green tree",
  "white cat",
];

export const mockImages = Array.from({ length: 120 }, (_, index) => {
  const id = index + 1;
  const memberId = (index % 5) + 1;
  const workerId = `${memberId}.1`;
  const subject = subjects[index % subjects.length];

  return {
    id,
    name: `${subject} ${workerId} demo${id}.png`,
    subject,
    memberId,
    workerId,
    model: "demo",
    url: `/api/demo-images/${id}.svg`,
    createdAt: new Date(
      Date.UTC(2026, 10, 2) + index * 60_000
    ).toISOString(),
  };
}).sort((a, b) => b.id - a.id);