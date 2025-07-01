-- Game outcomes by player
with player_with_outcome as (
	select
		white_player as player,
		case
			when outcome = 'WIN' and winner = white_player
				then 'WIN'
			when outcome = 'DRAW' then 'DRAW'
			else 'LOSS'
		end as outcome
	from game

	union all

	select
		black_player as player,
		case
			when outcome = 'WIN' and winner = black_player
				then 'WIN'
			when outcome = 'DRAW' then 'DRAW'
			else 'LOSS'
		end as outcome
	from game
)

select player, outcome, count(*)
from player_with_outcome
group by player
order by player, outcome;

-- Game durations by player
with stats_by_player as (
	select white_player as player, duration_ms
	from game

	union all

	select black_player as player, duration_ms
	from game
)

select
	player,
	max(duration_ms) as max,
	min(duration_ms) as min
from stats_by_player
group by player;

-- Move time histograms
select
	floor(duration_ms / 25) * 25 as range_start,
	floor(duration_ms / 25) * 25 + 25 as range_stop,
	count(*) as count
from move
group by 1, 2 order by 1;

-- Duration by move number
select
	move_number,
	avg(duration_ms) as avg_duration
from move
group by 1 order by 1;

select
    player,
	move_number,
	avg(duration_ms) as avg_duration
from move
group by 1, 2 order by 2, 1;
