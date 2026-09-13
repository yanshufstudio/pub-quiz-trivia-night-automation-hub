import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PackWithRoundsAndMedia } from "@/lib/session-state";
import { parseOptions, QUESTION_TYPE } from "@/lib/question-types";
import { toDataUri } from "@/lib/media";

type PackWithMedia = PackWithRoundsAndMedia;
type PdfQuestion = PackWithMedia["rounds"][number]["questions"][number];

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 44, fontSize: 11, fontFamily: "Times-Roman" },
  kicker: { fontSize: 9, letterSpacing: 1.4, textTransform: "uppercase", color: "#c2410c", marginBottom: 6 },
  title: { fontSize: 22, marginBottom: 4, fontFamily: "Times-Bold" },
  subtitle: { fontSize: 10, color: "#5c5348", marginBottom: 16 },
  headerRule: { borderBottomWidth: 1.5, borderBottomColor: "#1c1712", marginBottom: 14 },
  roundHeading: { fontSize: 16, marginTop: 16, marginBottom: 3, fontFamily: "Times-Bold" },
  roundCategory: { fontSize: 10, color: "#5c5348", fontStyle: "italic", marginBottom: 8 },
  questionRow: { flexDirection: "row", marginBottom: 4, alignItems: "flex-start" },
  questionNumber: { width: 22, fontFamily: "Times-Bold" },
  questionText: { flex: 1, lineHeight: 1.35 },
  answerKey: { flex: 1, color: "#14532d", fontFamily: "Times-Bold" },
  points: { width: 36, textAlign: "right", color: "#5c5348", fontSize: 9 },
  optionsLine: { marginLeft: 22, marginBottom: 6, color: "#5c5348", fontSize: 10 },
  cue: {
    color: "#5c5348",
    fontStyle: "italic",
    fontSize: 10,
    marginVertical: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#f7f1e6",
  },
  answerBox: {
    marginLeft: 22,
    marginBottom: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#ecfdf5",
    color: "#14532d",
    fontFamily: "Times-Bold",
    fontSize: 11,
  },
  writeLine: {
    marginLeft: 22,
    marginTop: 6,
    marginBottom: 10,
    borderBottomWidth: 0.8,
    borderBottomColor: "#c4b8a5",
    height: 16,
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#d4c8b4", paddingVertical: 6 },
  tableHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1c1712", paddingBottom: 4, marginBottom: 2 },
  colNum: { width: 22, fontFamily: "Times-Bold" },
  colQuestion: { flex: 1.3, paddingRight: 8, color: "#5c5348" },
  colAnswer: { flex: 1, color: "#14532d", fontFamily: "Times-Bold" },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, fontSize: 9, color: "#5c5348", textAlign: "center" },
  teamLine: { marginBottom: 12, fontSize: 11 },
  // Fixed box regardless of the source photo's aspect ratio, so a very tall
  // or very wide upload can never push a question's block taller than the
  // page allows for — `objectFit: "contain"` letterboxes rather than crops
  // or stretches.
  questionImage: { width: 140, height: 105, objectFit: "contain", marginLeft: 22, marginTop: 2, marginBottom: 6 },
});

/** Bytes straight from the row, inlined as a `data:` URI — never a URL. See
 * src/lib/media.ts and src/test/pdf-media-offline.integration.test.ts: the
 * renderer resolves an `<Image src>` with its own unguarded `fetch`, so this
 * is the only form a question's image may ever take here. */
function QuestionImage({ question }: { question: PdfQuestion }) {
  if (!question.media) return null;
  return <Image style={styles.questionImage} src={toDataUri(question.media)} />;
}

function Header({ pack, kicker }: { pack: PackWithMedia; kicker: string }) {
  return (
    <View style={styles.headerRule}>
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.title}>{pack.title}</Text>
      <Text style={styles.subtitle}>
        {pack.rounds.length} rounds · keep this copy at the lectern
      </Text>
    </View>
  );
}

function Footer() {
  return (
    <Text
      style={styles.footer}
      render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      fixed
    />
  );
}

function OptionsLine({ question }: { question: PdfQuestion }) {
  if (question.type !== QUESTION_TYPE.MULTIPLE_CHOICE) return null;
  const options = parseOptions(question.options);
  if (options.length === 0) return null;
  return <Text style={styles.optionsLine}>{options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join("   ")}</Text>;
}

/**
 * Page-break policy, shared by all three documents below: a round flows
 * across pages when it has to, no single question is ever split down the
 * middle (`wrap={false}` on the question or row, never on the round), and a
 * round heading is never left stranded at the foot of a page with nothing
 * under it (`minPresenceAhead`, roughly a heading plus its first question).
 *
 * Rounds used to carry `wrap={false}` themselves, to keep each one on one
 * page. That holds for a five-question round and silently fails for a ten-
 * question one — which is exactly what the wizard's own default brief
 * produces. react-pdf can't shrink a block that is taller than the page, so
 * it logged "Node of type VIEW can't wrap between pages and it's bigger
 * than available page height" and ran the round off the bottom of the sheet,
 * taking the last questions of every round with it. A quizmaster printing
 * that walks into the room with an incomplete pack.
 */
export function QuestionSheetDocument({ pack }: { pack: PackWithMedia }) {
  return (
    <Document title={`${pack.title} - Questions`}>
      <Page size="A4" style={styles.page} wrap>
        <Header pack={pack} kicker="Team question sheet" />
        <Text style={styles.teamLine}>Team name: _______________________________</Text>
        {pack.rounds.map((round) => (
          <View key={round.id} minPresenceAhead={90}>
            <Text style={styles.roundHeading}>
              Round {round.index + 1}: {round.title}
            </Text>
            <Text style={styles.roundCategory}>{round.category}</Text>
            {round.questions.map((q) => (
              <View key={q.id} wrap={false}>
                <View style={styles.questionRow}>
                  <Text style={styles.questionNumber}>{q.index + 1}.</Text>
                  <Text style={styles.questionText}>{q.text}</Text>
                  <Text style={styles.points}>{q.points} pt</Text>
                </View>
                <OptionsLine question={q} />
                <QuestionImage question={q} />
                <View style={styles.writeLine} />
              </View>
            ))}
          </View>
        ))}
        <Footer />
      </Page>
    </Document>
  );
}

export function AnswerSheetDocument({ pack }: { pack: PackWithMedia }) {
  return (
    <Document title={`${pack.title} - Answers`}>
      <Page size="A4" style={styles.page} wrap>
        <Header pack={pack} kicker="Host answer key" />
        {pack.rounds.map((round) => (
          <View key={round.id} minPresenceAhead={90}>
            <Text style={styles.roundHeading}>
              Round {round.index + 1}: {round.title}
            </Text>
            <Text style={styles.roundCategory}>{round.category}</Text>
            <View style={styles.tableHead}>
              <Text style={styles.colNum}>#</Text>
              <Text style={styles.colQuestion}>Question</Text>
              <Text style={[styles.colAnswer, { color: "#5c5348", fontFamily: "Times-Bold" }]}>Answer</Text>
              <Text style={styles.points}>Pts</Text>
            </View>
            {round.questions.map((q) => (
              <View key={q.id} wrap={false}>
                <View style={styles.tableRow}>
                  <Text style={styles.colNum}>{q.index + 1}</Text>
                  <Text style={styles.colQuestion}>{q.text}</Text>
                  <Text style={styles.colAnswer}>{q.answer}</Text>
                  <Text style={styles.points}>{q.points}</Text>
                </View>
                <QuestionImage question={q} />
              </View>
            ))}
          </View>
        ))}
        <Footer />
      </Page>
    </Document>
  );
}

export function PresenterScriptDocument({ pack }: { pack: PackWithMedia }) {
  return (
    <Document title={`${pack.title} - Presenter Script`}>
      <Page size="A4" style={styles.page} wrap>
        <Header pack={pack} kicker="Presenter script" />
        <Text style={styles.cue}>
          [Welcome everyone, introduce tonight’s quiz, and remind teams how scoring works.]
        </Text>
        {pack.rounds.map((round) => (
          <View key={round.id} minPresenceAhead={90}>
            <Text style={styles.roundHeading}>
              Round {round.index + 1}: {round.title}
            </Text>
            <Text style={styles.roundCategory}>{round.category}</Text>
            <Text style={styles.cue}>
              [Announce the round title and category. Give teams a moment to ready their sheets.]
            </Text>
            {round.questions.map((q) => (
              <View key={q.id} style={{ marginBottom: 6 }} wrap={false}>
                <View style={styles.questionRow}>
                  <Text style={styles.questionNumber}>{q.index + 1}.</Text>
                  <Text style={styles.questionText}>{q.text}</Text>
                  <Text style={styles.points}>{q.points} pt</Text>
                </View>
                <OptionsLine question={q} />
                <QuestionImage question={q} />
                <Text style={styles.answerBox}>Answer: {q.answer}</Text>
              </View>
            ))}
            <Text style={styles.cue}>
              [Read the answers, then confirm scores on the host dashboard before moving on.]
            </Text>
          </View>
        ))}
        <Text style={styles.cue}>[Announce final scores and thank everyone for playing.]</Text>
        <Footer />
      </Page>
    </Document>
  );
}
