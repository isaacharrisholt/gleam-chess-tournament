# The Gleam Chess Tournament

Welcome to the inaugural Unofficial Gleam Chess Tournament!

This is a friendly competition to see who can create the best chess bot in the
[Gleam](https://gleam.run) programming language. Once submissions are closed,
the tournament will be turned into a Twitch stream or YouTube video on
[my channel](https://youtube.com/IsaacHarrisHolt).

## Changelog

### 2025-04-28

- Updated submission guidelines. Submissions will now be happening through
  [CodeCrafters](https://codecrafters.io). See [the submission guidelines](#submissions)
  for more information.

### 2025-03-15

- Added a testing script to the `testing_utils` directory. See
  [the section on testing](#testing) for more information.

### 2025-03-12

- Updated Dockerfiles (#4, thanks @MoeDevelops!) to be a bit slimmer. You may still
  use the old Dockerfiles, which are now prefixed with `pre-2025-03-11-`.
- Added a new rule to limit the total number of failures a bot is allowed per game
  before forfeiting. This is to prevent the potential workaround outlined in #5.
  The limit is currently **15** failures.
- Added new prizes! Thanks [CodeCrafters](https://www.codecrafters.io/) for the
  sponsorship!

### 2025-03-11

- Added [birl](https://hexdocs.pm/birl/index.html),
  [gtempo](https://hexdocs.pm/gtempo/index.html) and
  [gleam_time](https://hexdocs.pm/gleam_time/index.html) as allowed libraries for all
  targets.

## How does it work?

Essentially, each entry will be a Gleam web server that responds to HTTP requests sent
to a `/move` endpoint. The body will be a JSON object containing three fields:

```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "turn": "white",
  "failed_moves": ["Nf3"]
}
```

| Field          | Description                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `fen`          | The [FEN](https://en.wikipedia.org/wiki/Forsyth%E2%80%93Edwards_Notation) of the current board position. |
| `turn`         | The side to move. Either `"white"` or `"black"`.                                                         |
| `failed_moves` | A list of moves that your bot attempted to make for this turn, but were not legal moves.                 |

The task of parsing the FEN and returning a move is left up to you.

## Prizes

Prizes will be awarded to the top three entries. The winner will be determined by
tournament.

An additional prize will be awarded to the entry with the most interesting strategy.

- 1st place: $500, a Lucy T-shirt and a Lucy mug, and CodeCrafters VIP memberships for
  you and your team
- 2nd place: $300 and a T-shirt OR mug, and 1 year CodeCrafters memberships for you
  and your team
- 3rd place: $100 and a T-shirt OR mug, and 3 month CodeCrafters memberships for you
  and your team
- Most interesting strategy: $50 and a T-shirt OR mug, and 1 month CodeCrafters
  memberships for you and your team

See the [Gleam shop](https://shop.gleam.run/) for more information on merch.

### CodeCrafters

Thanks to [CodeCrafters](https://www.codecrafters.io/) for sponsoring the prizes!
Check them out for an awesome way to get better at coding.

<a href="https://www.codecrafters.io/" target="_blank" rel="noopener noreferrer">
    <img src="https://codecrafters.io/_next/static/media/logo.df7bb93f.png" width="200px">
</a>

## Submissions

Submissions should be Gleam web servers and may use either the Erlang or JavaScript
targets. Templates for both are provided in the `erlang_template` and
`javascript_template` directories respectively.

Submissions will be pitted against each other by a client running the
[chess.js](https://github.com/jhlywa/chess.js) library for tracking and validation.

The format of the tournament is yet to be decided and will likely depend on the
number of submissions.

Ssubmissions will be happening through [CodeCrafters](https://codecrafters.io).
they’ve very kindly put together two new challenges on their site to support the
competition - one for bots running on the Erlang target, and another for bots
running on JavaScript.

If you’ve not used CodeCrafters before, essentially, it’s an online platform for
learning intermediate-to-advanced software engineering concepts by recreating popular
software like SQLite, Redis and Kafka.

When you start a CodeCrafters challenge, you’ll get access to a special Git repo,
and when you push code to that repo, the CodeCrafters Git server will run tests against
your submission, allowing you to progress to the next stage of the challenge.

For the purposes of the chess bot tournament, the challenges test your bot against a
number of boards to ensure you produce valid moves. You can submit your bot by completing
stage 5 (which just requires you to fill out a markdown file with your entry details), and
I’ll be given access to your bot once the tournament has ended, so you won’t need to do
anything else!

You can keep pushing updates up to the deadline, of course, and I’ll test against the
most recent commit pushed before the competition reaches its end.

Check out the CodeCrafters challenges here:

- [Erlang](https://app.codecrafters.io/courses/gleam-chess-bot/overview)
- [JavaScript](https://app.codecrafters.io/courses/gleam-chess-bot-js/overview)

If you’re not already signed up to CodeCrafters, you should be! You can get 40%
off (and support me and the competition!) by clicking [here](https://ihh.dev/codecrafters).

## How to participate

- Install [Gleam](https://gleam.run) and clone this repository.
- Create a new directory for your submission and copy the `erlang-template` or
  `javascript-template` directory into it.
- Ensure you can run `gleam run` and the webserver starts correctly on port `8000`.
- Fill out the `move` function in `src/<target>_template/chess.gleam` with your bot's logic.
  - The function should return a `Result(String, String)` where the `Ok` variant
    is a move in [SAN](<https://en.wikipedia.org/wiki/Algebraic_notation_(chess)>)
    format. The client will validate using `chess.js`'s permissive move parser
    (see [here](https://github.com/jhlywa/chess.js?tab=readme-ov-file#parsers-permissive--strict)).
- Ensure your program compiles and runs correctly.
- Ensure you can build a Docker image for your submission using the `Dockerfile`
  provided in the template project.
- Write up a brief description of how your bot works in the `README.md` file.
- Once you're happy with your bot, submit your project [here](TODO).

## Rules

- You can participate alone or in a group.
- You may only submit one entry per person.
  - If you wish to update your entry before the tournament closes, please reach out
    to me via [Bluesky](https://bsky.app/profile/ihh.dev) or in the #chess-tournament
    channel in [my Discord](https://discord.com/invite/bWrctJ7).
- You may only use a limited set of external libraries. See [the libraries list](#libraries).
  for more information.
- You may not do any IO operations to the filesystem or network.
- FFI is not allowed.
- Your bot may not use more than the following resources. These will be enforced by Docker:
  - 2 CPU cores
  - 512mb of RAM
- Each move will be timed out after 5 seconds.
- If your bot fails three times for the same turn, either by timing out or by failing
  to make a legal move, it will forfeit the match.
  - Your bot will also forfeit if it fails or times out **15** times total during the
    match. See #5 for details.
- You may not modify the provided Dockerfile.
- The bots will run on Gleam **1.9.1**.
  - The JavaScript bot will run on Deno, as that's what's best supported by Glen.
- You may not modify the project names (sorry, it'll break Dockerfiles!).

### Libraries

The following is a list of libraries allowed on each target. If you feel that the list
is missing something, please open an issue.

You may use any dev dependencies you wish, but they must not be included in the built
output.

#### All targets

- [gleam_stdlib](https://hexdocs.pm/gleam_stdlib/index.html)
- [gleam_http](https://hexdocs.pm/gleam_http/index.html)
- [gleam_json](https://hexdocs.pm/gleam_json/index.html)
- [gleam_time](https://hexdocs.pm/gleam_time/index.html)
- [gleam_community_maths](https://hexdocs.pm/gleam_community_maths/index.html)
- [flash](https://hexdocs.pm/flash/index.html)
- [iv](https://hexdocs.pm/iv/index.html)
- [glearray](https://hexdocs.pm/glearray/index.html)
- [snag](https://hexdocs.pm/snag/index.html)
- [birl](https://hexdocs.pm/birl/index.html)
- [gtempo](https://hexdocs.pm/gtempo/index.html)

#### Erlang

- [gleam_erlang](https://hexdocs.pm/gleam_erlang/index.html)
- [gleam_otp](https://hexdocs.pm/gleam_otp/index.html)
- [mist](https://hexdocs.pm/mist/index.html)
- [wisp](https://hexdocs.pm/wisp/index.html)

#### JavaScript

- [gleam_javascript](https://hexdocs.pm/gleam_javascript/index.html)
- [glen](https://hexdocs.pm/glen/index.html)

## Testing

The [`testing_utils`](./testing_utils) directory contains a Deno test script that
will run a suite of test moves against your bot. Feel free to use it as you see fit.

Run the tests with `deno run test`, assuming your bot is running on port `8000`
(which it should be!).

## Newsletter

To be kept up to date with the latest news and updates, rule changes and so forth,
subscribe to the [Gleam Chess newsletter](https://buttondown.com/gleamchess).

## Useful resources

- [The Chess Programming Wiki](https://www.chessprogramming.org/Main_Page)
