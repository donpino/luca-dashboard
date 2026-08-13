// §8.1 — default landing tab. Panel implementations land in later commits;
// this ships the three panel slots as empty shells (nav-shell commit).
import EmptyPanel from '../panels/EmptyPanel'

export default function Today() {
  return (
    <>
      <EmptyPanel title="Last night" />
      <EmptyPanel title="Today's session" />
      <EmptyPanel title="Flag" />
    </>
  )
}
