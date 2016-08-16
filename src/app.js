/**
 * Welcome to Pebble.js!
 *
 * This is where you write your app.
 */

var UI = require('ui');
var ajax = require('ajax');
var Vector2 = require('vector2');
var Settings = require('settings');
var Platform = require('platform');
var Clay = require('clay');
var clayConfig = require('config');
var clay = new Clay(clayConfig);

var settings = Settings.state.options;
var selectedDate = new Date();
var gameMenu;
var gameCard;
var identifierKeys = ['favTeam1', 'favTeam2', 'favTeam3']; // Don't judge me, this makes things easier to read
var FAVORITE_TEAM_IDENTIFIERS = []; // Eg ATL, SEA, MI

for (var keyIndex in identifierKeys) {
	var key = identifierKeys[keyIndex];
	var choice = settings[key];
	if (choice !== '') {
		FAVORITE_TEAM_IDENTIFIERS.push(choice);
	}
}

var refreshInterval;
var isStartup = true;
var isBlurbView = false;
console.log(settings.refreshRate);
var timeToRefresh = (settings.refreshRate * 1000) || 30000;
var scoreKey = '';
var vibrateDisconnect = false;
var vibrateScoreChange = false;
var hasDisconnected = false;

for (var opt in settings.vibrateOpts) {
	if (settings.vibrateOpts[opt] === 'scoreChange') {
		vibrateDisconnect = true;
	}
	else if (settings.vibrateOpts[opt] === 'scoreChange') {
		vibrateScoreChange = true;
	}
}

var main = new UI.Card({
	title: 'Mr. Baseball',
	subtitle: 'Loading...',
  body: 'If games fail to load, hold select to retry',
	status: {
		separator: 'none'
	}
});

Pebble.addEventListener('showConfiguration', function(e) {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (e && !e.response) {
    return;
  }
  var dict = clay.getSettings(e.response);
  Settings.option(dict);
});

main.on('longClick', 'select', function () {
	requestGames(showMenu, main);
});

var dateSelectWindow = new UI.Window({
	clear: true,
	backgroundColor: 'white',
	action: {
		up: 'images/action_bar_icon_up.png',
		down: 'images/action_bar_icon_down.png',
		select: 'images/action_bar_icon_check.png'
	}
});
dateSelectWindow.isBeingViewed = false;

var dateString = selectedDate.toDateString();
var dateText = new UI.Text({
	position: new Vector2(-14, 70),
	size: new Vector2(180, 180),
	font: 'gothic-24',
	text: dateString,
	textAlign: 'center',
	color: 'black',
	backgroundColor: 'white'
});

dateSelectWindow.add(dateText);

dateSelectWindow.on('click', 'select', function () {
	requestGames(showMenu, gameMenu);
	dateSelectWindow.isBeingViewed = false;
});

dateSelectWindow.on('click', 'up', function() {
	selectedDate.setDate(selectedDate.getDate() + 1);
	refreshDateWindow();
});

dateSelectWindow.on('click', 'down', function() {
	selectedDate.setDate(selectedDate.getDate() - 1);
	refreshDateWindow();
});

function refreshDateWindow () {
	var newDateString = selectedDate.toDateString();
	var newDateText = new UI.Text({
		position: new Vector2(-14, 70),
		size: new Vector2(180, 180),
		font: 'gothic-24',
		text: newDateString,
		textAlign: 'center',
		color: 'black',
		backgroundColor: 'white'
	});
	
	dateSelectWindow.add(newDateText);
	dateSelectWindow.remove(dateText);
	dateText = newDateText;
}

function intervalRefresh () {
	if ((new Date()).toDateString() !== selectedDate.toDateString()) {
		// Do nothing
	}
	else if (isBlurbView) {
		// Do nothing
	}
	else if (gameCard && gameCard.isBeingViewed) {
		refreshGame(gameCard.Id, gameCard, true);
	}
	else if (dateSelectWindow.isBeingViewed) {
		// Do nothing
	}
	else {
		gameMenu.selection(function (selected) {
			requestGames(showMenu, gameMenu, selected.itemIndex, true);
		});
	}
}

function showMenu (games, itemIndex) {
	var menuList = arrangeGamesForMenu(games);
	
	main.hide();
	
	var oldMenu = gameMenu;
	gameMenu = null;
	
	var highlightBColor = Platform.version() === 'aplite' ? 'black' : '#55FFFF';
	var highlightTColor = Platform.version() === 'aplite' ? 'white' : 'black';
	gameMenu = new UI.Menu({
		sections: [menuList],
		games: games,
		highlightBackgroundColor: highlightBColor,
		highlightTextColor: highlightTColor,
		status: {
			separator: 'none'
		}
	});
	
	if (typeof itemIndex !== 'undefined') {
		gameMenu.selection(0, itemIndex);
	}
	
	gameMenu.on('select', function (selection) {
		if (selection.itemIndex === gameMenu.state.sections[0].items.length - 1) {
			dateSelectWindow.show();
			dateSelectWindow.isBeingViewed = true;
		}
		else {
			var games = selection.menu.state.games;
			var index = selection.itemIndex;
			var gameObj = getGame(games, index);
			showGame(gameObj, index);
		}
	});
	
	gameMenu.on('longSelect', function (selection) {
		requestGames(showMenu, gameMenu, selection.itemIndex);
	});
	
	gameMenu.on('click', 'back', function() {
		gameMenu.hide();
	});
	
	if (typeof gameCard === 'undefined' || !gameCard.isBeingViewed) {
		gameMenu.show();
	}
	if (oldMenu) {
		oldMenu.hide();
	}
	
}

function arrangeGamesForMenu (games) {
	var menuList = [];
	
	for (var index in games) {
		var game = games[index];
		var titleText = '';
		var subtitleText = '';
		
		// Simple check that the game has started
		if (game.linescore) {
			var homeScore = game.linescore.r.home;
			var awayScore = game.linescore.r.away;
			titleText = game.away_name_abbrev + ': ' + awayScore + ' - ' +
					game.home_name_abbrev + ': ' + homeScore;
			if (game.status.status === 'Final' || game.status.status === 'Game Over') {
				var extras = parseFloat(game.status.inning) > 9 ? '/' + game.status.inning : '';
				titleText = titleText + ' (F' + extras + ')';
			}
			else {
				if(!game.status.inning_state && (game.status.inning === '1' || game.status.inning === '')) {
					subtitleText = '@ ' + getLocalTime(game) + ' (warmup)';
				}
				else {
					subtitleText = game.status.inning_state + ' ' + game.status.inning;
				}
			}
		}
		else {
			titleText = game.away_name_abbrev + ' @ ' + game.home_name_abbrev;
			subtitleText = getLocalTime(game);
		}
		
		menuList.push({
			title: titleText,
			subtitle: subtitleText
		});	
	}
	
	// Date selector:
	menuList.push({
		title: 'Select a Date'
	});
	
	var menu = {
		title: selectedDate.toDateString(),
		items: menuList
	};
	
	return menu;
}

function requestGames (showMenu, loadView, itemIndex, isAuto) {
	
	var ballurl = getURL();
	
  ajax(
    {
      url: ballurl,
      type:'json'
    },
    function (data) {
			if (typeof isAuto === 'undefined' && !dateSelectWindow.isBeingViewed && !isStartup) {
				isStartup = false;
				UI.Vibe.vibrate('short');
			}
			
			var games = data.data.games.game;
			games.sort(gameSort);
      showMenu(games, itemIndex);
			dateSelectWindow.hide();
			if (loadView) {
				loadView.hide();
			}
				
			// set interval
      if (!refreshInterval) {
				refreshInterval = setInterval(intervalRefresh,timeToRefresh);
				
			}
			if (hasDisconnected) {
				hasDisconnected = false;
			}
    },
    function(error) {
			if (!hasDisconnected) {
				UI.Vibe.vibrate('double');
				hasDisconnected = true;
			}
			console.log(error);
		}
  );
}

function getURL () {
	
	var date = [];
	date.push(selectedDate.getFullYear());
	date.push(selectedDate.getMonth());
	date.push(selectedDate.getDate());
	
	// Month is given from 0-11
	var month = (date[1] + 1).toString();
	if (month.length === 1) {
		date[1] = '0' + month;
	}
	
	var day = date[2].toString();
	if (day.length === 1) {
		date[2] = '0' + day;
	}
	
	var baseUrl = 'http://m.mlb.com/gdcross/components/game/mlb/';
	var urlyear = 'year_' + date[0] + '/';
	var urlmonth = 'month_' + date[1] + '/';
	var urlday = 'day_' + date[2] + '/';
	var scoreText = 'master_scoreboard.json';
	
	var ballurl = baseUrl + urlyear + urlmonth + urlday + scoreText;
	
	return ballurl;
}

function getGame(games, index) {
  var game = games[index];
  var gameAttributes;
  
  // Game status
  var status = game.status;
  var gameState = status.status;
  var balls = status.balls;
  var strikes = status.strikes;
  var inning = status.inning;
	var inningState = status.inning_state;
	
	var pbpText = '';
	if (typeof game.pbp !== 'undefined') {
		if (typeof game.pbp.last !== 'undefined') {
			pbpText = game.pbp.last;
		}
	}
  	
  // Attributes that only apply to in progress games
  if (status.status === 'In Progress') {
    // Batter
    var batter = game.batter;
		var batterDisplay = batter.name_display_roster;
    var batterName = batter.first + ' ' + batter.last;
    var batterStats = batter.avg + '/' + batter.obp + '/' + batter.slg;
    
    // Pitcher
    var pitcher = game.pitcher;
		var pitcherDisplay = pitcher.name_display_roster;
    var pitcherName = pitcher.first + ' ' + pitcher.last;
    var pitcherStats = pitcher.wins + '-' + pitcher.losses + ', ' + pitcher.era;
		
		// for the sake of readability
		var runners = {
			'1B': false,
			'2B': false,
			'3B': false
		};
		
		if (game.runners_on_base) {
			var run = game.runners_on_base;
			
			if (run.runner_on_1b) {
				runners['1B'] = true;
			}
			if (run.runner_on_2b) {
				runners['2B'] = true;
			}
			if (run.runner_on_3b) {
				runners['3B'] = true;
			}
		}
    
    gameAttributes = {
			batterDisplay: batterDisplay,
      batterName: batterName,
      batterStats: batterStats,
			pitcherDisplay: pitcherDisplay,
      pitcherName: pitcherName,
      pitcherStats: pitcherStats,
			runners: runners
    };
  }
  
  // Attributes that only apply to final games
  else if (status.status === 'Final' || status.status === 'Game Over') {
    // Winning pitcher
    var wp = game.winning_pitcher;
    var wpName = wp.name_display_roster;
    var wpStats = wp.wins + '-' + wp.losses + ', ' + wp.era;
    
    // Losing pitcher
    var lp = game.losing_pitcher;
    var lpName = lp.name_display_roster;
    var lpStats = lp.wins + '-' + lp.losses + ', ' + lp.era;
    
		// Save pitcher
		var sp = game.save_pitcher;
		var spName = sp.name_display_roster;
    var spStats = sp.wins + '-' + sp.losses + ', ' + sp.era;
		
    gameAttributes = {
      wp: {
        name: wpName,
        stats: wpStats
      },
      lp: {
        name: lpName,
        stats: lpStats
      },
			sp: {
				name: spName,
				stats: spStats
			}
    };
  }
  
	// Games in preview
	else if (status.status === 'Preview') {
		var app = getPitcherObj(game.away_probable_pitcher);
		var hpp = getPitcherObj(game.home_probable_pitcher);
		gameAttributes = {
			app: app,
			hpp: hpp
		};
	}
	
	// Postponed
	else if (status.status === 'Postponed') {
		gameAttributes = {
			reason: status.reason
		};
	}
	
  // Names
  var away = game.away_name_abbrev;
  var home = game.home_name_abbrev;
    
  // Game score
	var hasStarted = false;
	if (game.linescore) {
		var score = game.linescore;
		var homeScore = score.r.home;
		var awayScore = score.r.away;
		hasStarted = true;
	}
	
	// Time start
	var timeStart = game.time + game.time_zone;
  
  var gameObj = {
    status: status,
    home: home,
    away: away,
    balls: balls,
    strikes: strikes,
    homeScore: homeScore,
    awayScore: awayScore,
    inning: inning,
    gameState: gameState,
    attributes: gameAttributes,
		timeStart: timeStart,
		hasStarted: hasStarted,
		inningState: inningState,
		UID: game.id,
		dir: game.game_data_directory,
		pbpText: pbpText,
		index: index
  };
  
  return gameObj;
}
	
function getPitcherObj (pitcher) {
	// Winning pitcher
	var name = pitcher.first + ' ' + pitcher.last;
	var stats = pitcher.wins + '-' + pitcher.losses + ', ' + pitcher.era;

	return {
		name: name,
		stats: stats
	};
}

function refreshGame (gameId, gameCard, isAuto) {
	var ballurl = getURL();
	
	ajax(
		{
			url: ballurl,
			type:'json'
		},
		function (data) {
			if (typeof isAuto === 'undefined') {
				UI.Vibe.vibrate('short');
			}

			var games = data.data.games.game;
			games.sort(gameSort);
			var game = findGame(games, gameId);
			showGame(game, gameCard.viewState);
			showMenu(games, gameCard.menuIndex);
			gameCard.pbpCard.hide();
			gameCard.matchup.hide();
			if (gameCard.blurbCard) {
				gameCard.blurbCard.hide();
			}

			if (hasDisconnected) {
				hasDisconnected = false;
			}
		},
		function(error) {
			if (!hasDisconnected) {
				UI.Vibe.vibrate('double');	
			}
			console.log('Download failed: ' + error);
		}
	);
}

function findGame (games, gameId) {
	for (var index in games) {
		var game = games[index];
		if (game.id === gameId) {
			return getGame(games, index);
		}
	}
}

function getDateObj (game) {
	var dateString = selectedDate.toJSON().split('T')[0];
	
	var givenTime = game.time_aw_lg;
	var timeSpl = game.time_aw_lg.split(':');
	var offset = game.time_zone_aw_lg;
	
	if (offset.length > 1) {
		offset = offset[1];
	}
	
	// I'm fairly certain a game won't be scheduled past 12:00AM
	if (game.ampm === 'PM' && timeSpl[0] !== '12') {
		givenTime = (parseInt(timeSpl[0]) + 12).toString() + ':' + timeSpl[1];
	}
	
	var newDate = new Date(dateString + 'T' + givenTime + '-0' + offset + '00');
	
	return newDate;
}

function getLocalTime (game) {
	var newDate = getDateObj(game);
	
	var minutes = newDate.getMinutes().toString();
	var ampm = newDate.getHours() > 12 ? 'PM' : 'AM';
	var hours = newDate.getHours() > 12 ? (newDate.getHours() % 12).toString() : newDate.getHours().toString();
	return hours + ':' + (minutes.length > 1 ? minutes : ('0' + minutes)) + ' ' + ampm;
}

// Actually the worst code I've ever written
// PebbleJS does not provide a DOM parser
function getBlurb (data) {
	var spl = data.split('<blurb>');
	if (spl.length > 1) {
		var bStart = spl[1];
		var bspl = bStart.split(']]>');
		var bracketspl = bspl[0].split('TA[');
		return bracketspl[1];
	}
	return null;
}

function drawGame (game) {
	var elementList = [];
	var adjuster = 180;
	if (Platform.version() === 'basalt' || Platform.version() === 'aplite') {
		adjuster = 144;
	}
	
	var stxPos = adjuster === 180 ? 14 : 6;
	var stateText = new UI.Text({
		position: new Vector2(stxPos, 60),
		size: new Vector2(180, 180),
		font: 'gothic-18-bold',
		text: 'B:\nS:\nO:\n',
		textAlign: 'left',
		color: 'black',
		backgroundColor: 'white'
	});
	elementList.push(stateText);
	
	var scoreLine = new UI.Line({
		strokeColor: 'black',
		strokeWidth: 1,
		position: new Vector2(89 * (adjuster/180),20),
		position2: new Vector2(89 * (adjuster/180),58),
		backgroundColor: 'white'
	});
	elementList.push(scoreLine);

	var awayName = new UI.Text({
		position: new Vector2(-8 * (adjuster/180), 10),
		size: new Vector2(90 * (adjuster/180), 24),
		font: 'gothic-24-bold',
		text: game.away,
		textAlign: 'right',
		color: 'black',
		backgroundColor: 'white'
	});
	elementList.push(awayName);

	var homeName = new UI.Text({
		position: new Vector2(98 * (adjuster/180), 10),
		size: new Vector2(90 * (adjuster/180), 24),
		font: 'gothic-24-bold',
		text: game.home,
		textAlign: 'left',
		color: 'black',
	});
	elementList.push(homeName);
	
	var awayScore = new UI.Text({
		clear: true,
		position: new Vector2(-8 * (adjuster/180), 38),
		size: new Vector2(90 * (adjuster/180), 20),
		font: 'leco-20-bold-numbers',
		text: game.awayScore,
		textAlign: 'right',
		color: '#555555',
		backgroundColor: 'white'
	});
	elementList.push(awayScore);

	var homeScore = new UI.Text({
		clear: true,
		position: new Vector2(98 * (adjuster/180), 38),
		size: new Vector2(90 * (adjuster/180), 20),
		font: 'leco-20-bold-numbers',
		text: game.homeScore,
		textAlign: 'left',
		color: '#555555',
		backgroundColor: 'white'
	});
	elementList.push(homeScore);
	
	var timeText = new UI.TimeText({
		text: '%I:%M',
		size: new Vector2(180 * (adjuster/180), 16),
		position: new Vector2(0, 2),
		textAlign: 'center',
		color: 'black',
		backgroundColor: 'white',
		font: 'gothic-14'
	});
	elementList.push(timeText);

	var delta = adjuster === 180 ? 16 : 18;
	var x0 = adjuster === 180 ? 36 : 34;
	for (var ball = 0; ball < 4; ball++) {
		var bcolor = (ball < parseInt(game.status.b)) ? 'blue' : 'white';
		var ballCircle = new UI.Circle({
			clear: true,
			position: new Vector2((x0 + (delta*ball)) * (adjuster/180), 72),
			radius: 6,
			backgroundColor: bcolor,
			borderColor: 'black',
			bordoerWidth: 1
		});
		elementList.push(ballCircle);
	}

	for (var strike = 0; strike < 3; strike++) {
		var scolor = (strike < parseInt(game.status.s)) ? 'red' : 'white';
		var strikeCircle = new UI.Circle({
			clear: true,
			position: new Vector2((x0 + (delta*strike)) * (adjuster/180), 90),
			radius: 6,
			backgroundColor: scolor,
			borderColor: 'black',
			bordoerWidth: 1
		});
		elementList.push(strikeCircle);
	}
	
	for (var out = 0; out < 3; out++) {
		var ocolor = (out < parseInt(game.status.o)) ? (Platform.version() === 'aplite' ? 'black' : '#00AA00') : 'white';
		var outCircle = new UI.Circle({
			clear: true,
			position: new Vector2((x0 + (delta*out)) * (adjuster/180), 108),
			radius: 6,
			backgroundColor: ocolor,
			borderColor: 'black',
			bordoerWidth: 1
		});
		elementList.push(outCircle);
	}
	
	var runners = game.attributes.runners;
	
	var fullBase = Platform.version() === 'aplite' ? 'full-aplite' : 'full';
	var baseOne = runners['1B'] ? fullBase : 'empty';
	var baseImage1 = new UI.Image({
		position: new Vector2(152 * (adjuster/180),96),
		size: new Vector2(10,10),
		image: 'images/base-' + baseOne + '.png'
	});
	elementList.push(baseImage1);

	var baseTwoY = adjuster === 180 ? 72 : (96 - (24 * (adjuster/180)));
	var baseTwo = runners['2B'] ? fullBase : 'empty';
	var baseImage2 = new UI.Image({
		position: new Vector2(128 * (adjuster/180),baseTwoY),
		size: new Vector2(10,10),
		image: 'images/base-' + baseTwo + '.png'
	});
	elementList.push(baseImage2);

	var baseThree = runners['3B'] ? fullBase : 'empty';
	var baseImage3 = new UI.Image({
		position: new Vector2(104 * (adjuster/180),96),
		size: new Vector2(10,10),
		image: 'images/base-' + baseThree + '.png'
	});
	elementList.push(baseImage3);

	var pText = new UI.Text({
		position: new Vector2(0, 116),
		size: new Vector2(180 * (adjuster/180), 14),
		font: 'gothic-14',
		text: 'P: ' + game.attributes.pitcherDisplay,
		color: 'black',
		textAlign: 'center',
		backgroundColor: 'white'
	});
	elementList.push(pText);

	var bText = new UI.Text({
		position: new Vector2(0, 132),
		size: new Vector2(180 * (adjuster/180), 14),
		font: 'gothic-14',
		text: 'B: ' + game.attributes.batterDisplay,
		color: 'black',
		textAlign: 'center',
		backgroundColor: 'white'
	});
	elementList.push(bText);
	
	var inning = game.inningState + ' ' + game.inning;
	var iText = new UI.Text({
		position: new Vector2(0, 148),
		size: new Vector2(180 * (adjuster/180), 14),
		font: 'gothic-14',
		text: inning,
		color: 'black',
		textAlign: 'center',
		backgroundColor: 'white'
	});
	elementList.push(iText);
	
	var gameWindow = new UI.Window({
		backgroundColor: 'white'
	});
	for (var index in elementList) {
		gameWindow.add(elementList[index]);
	}
	
	return gameWindow;
}

function showGame (game, viewState) {
	// Immediately run ajax in order to get blurb
	
	var blurbText = '';
	var blurbCard;
	var blurbTitle;
	if (game.gameState !== 'In Progress') {
		ajax(
			{
				url: 'http://m.mlb.com/gdcross/' + game.dir + '/gamecenter.xml',
				type:'xml',
				async: true
			},
			function (data) {

				if (data.indexOf('wrap') !== -1) {
					var spl = data.split('wrap');
					var blurb = getBlurb(spl[1]);
					if (blurb) {
						blurbText = blurb;
						blurbTitle = 'Game Wrap';
					}
				} 

				if (blurbText.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '') === '') {
					blurbText = getBlurb(data);
					blurbTitle = 'Game Brief';
				}

				blurbCard = new UI.Card({
					title: blurbTitle,
					body: blurbText,
					scrollable: true,
					style: 'small',
					status: {
						separator: 'none'
					}
				});

				blurbCard.on('click', 'back', function () {
					gameCard.show();
					blurbCard.hide();
					isBlurbView = false;
				});
			},
			function(error) {
			}
		);
	}
	
	
  var attributes = game.attributes;
  var gameText = '';
	var subtitle = '';
	var style = 'small';
	var matchupText = '';
	var hpp;
	var app;
	var oldGameCard = gameCard;
	var gameDrawn = false;
	
  if (typeof attributes !== 'undefined') {
    if (game.gameState === 'In Progress') {
			matchupText = attributes.pitcherName + '\n (' + attributes.pitcherStats + ')\n' + attributes.batterName + '\n ('+ attributes.batterStats + ')';
			gameCard = drawGame(game);
			gameDrawn = true;
    }
    else if (game.gameState === 'Final' || game.gameState === 'Game Over') {
      var winner = attributes.wp;
      var loser = attributes.lp;
			var saver = attributes.sp;
      gameText = 'W: ' + winner.name + ' (' + winner.stats + ')\nL: ' + loser.name + ' (' + loser.stats + ')';
			if (saver.name !== '') {
				gameText = gameText + '\nS: ' + saver.name + ' (' + saver.stats + ')';
			}
    }
		else if (game.gameState === 'Preview') {
			hpp = attributes.hpp;
			app = attributes.app;
			subtitle = 'Probable pitchers:';
			gameText = 'HP: ' + hpp.name + '\n (' + hpp.stats + ')\n' + 'AP: ' + app.name + '\n (' + app.stats + ')';
		}
		else if (game.gameState === 'Postponed') {
			hpp = attributes.hpp;
			app = attributes.app;
			subtitle = game.gameState + ' - ' + attributes.reason;
			style = 'classic-small';
		}
  }
  
	if (game.hasStarted) {
		subtitle = game.awayScore + ' - ' + game.homeScore; 
		if (game.gameState === 'Final' || game.gameState === 'Game Over') {
			var extras = parseFloat(game.inning) > 9 ? ('/' + game.inning) : '';
			subtitle = subtitle + ' (Final' + extras + ')';
		}
		else if (!game.status.inning_state && (game.status.inning === '1' || game.status.inning === '')) {
			subtitle = subtitle + ' (warmup)';
		}
		else {
			subtitle = subtitle + ' ' + game.inningState + ' ' + game.inning; 
		}
	}
	
	var matchup = new UI.Card({
		title: 'Matchup',
		body: matchupText,
		style: style,
		status: {
			separator: 'none'
		}
	});

	matchup.on('click', 'up', function () {
		gameCard.show();
		matchup.hide();
		gameCard.viewState = 'GameView';
	});
	
	matchup.on('click', 'back', function () {
		gameCard.show();
		matchup.hide();
		gameCard.viewState = 'GameView';
	});

	var pbpCard = new UI.Card({
		title: 'Last Play',
		body: game.pbpText,
		style: 'small',
		status: {
			separator: 'none'
		}
	});

	pbpCard.on('click', 'down', function () {
		gameCard.show();
		pbpCard.hide();
		gameCard.viewState = 'GameView';
	});
	
	pbpCard.on('click', 'back', function () {
		gameCard.show();
		pbpCard.hide();
		gameCard.viewState = 'GameView';
	});
  
	if (!gameDrawn) {
		gameCard = new UI.Card({
			title: game.away + ' @ ' + game.home,
			subtitle: subtitle,
			body: gameText,
			style: style,
			status: {
				separator: 'none'
			}
		});
	}
	
	gameCard.isBeingViewed = true;
	gameCard.gameState = game.gameState;
	gameCard.pbpCard = pbpCard;
	gameCard.matchup = matchup;
	gameCard.blurbCard = blurbCard;
	gameCard.menuIndex = game.index;
	
	var gameCardScoreKey = game.homeScore + '-' + game.awayScore;
	if (scoreKey === '') {
		scoreKey = game.homeScore + '-' + game.awayScore;
	}
	else if (gameCardScoreKey !== scoreKey && vibrateScoreChange) {
		UI.Vibe.vibrate('short');
		scoreKey = game.homeScore + '-' + game.awayScore;
	}
	
	gameCard.on('longClick', 'select', function () {
		refreshGame(game.UID, gameCard);
	});
	
	gameCard.on('click', 'up', function () {
		if (game.pbpText) {
			pbpCard.show();
			gameCard.hide();
			gameCard.viewState = 'PBPView';
		}
	});
	
	gameCard.on('click', 'down', function () {
			if (matchupText) {
				matchup.show();
				gameCard.hide();
				gameCard.viewState = 'MatchupView';
			}
	});
	
	gameCard.on('click', 'select', function () {
		if (blurbText !== '') {
			blurbCard.show();
			isBlurbView = true;
		}
	});
	
	gameCard.on('click', 'back', function () {
		gameMenu.show();
		gameCard.hide();
		gameCard.isBeingViewed = false;
		scoreKey = '';
	});
	

	console.log(viewState);
	if (viewState === 'MatchupView' && matchupText) {
		matchup.show();
		gameCard.viewState = 'MatchupView';
	}
	else if (viewState === 'PBPView' && game.pbpText) {
		pbpCard.show();
		gameCard.viewState = 'PBPView';
	}
	else {
		gameCard.show();
		gameCard.viewState = 'GameView';
		if (oldGameCard) {
			oldGameCard.hide();
		}
	}
  gameCard.Id = game.UID;
	
}

function gameSort (a,b) {

	for (var teamIndex in FAVORITE_TEAM_IDENTIFIERS) {
		var identifier = FAVORITE_TEAM_IDENTIFIERS[teamIndex];
		if (a.away_name_abbrev === identifier || a.home_name_abbrev === identifier) {
			return -1;
		}
		else if (b.away_name_abbrev === identifier || b.home_name_abbrev === identifier) {
			return 1;
		}
	}
	
	var aTime = getDateObj(a).getTime();
	var bTime = getDateObj(b).getTime();
	
	if (a.status.status !== b.status.status) {
		if (a.status.status === 'In Progress') {
			return -1;
		} else if (b.status.status === 'In Progress') {
			return 1;
		} else if (a.status.status === 'Final' || a.status.status === 'Game Over') {
			return 1;
		} else if (b.status.status === 'Final' || b.status.status === 'Game Over') {
			return -1;
		}
	}
	else if (a.status.status === 'In Progress') {
		return bTime - aTime;
	}
	return aTime - bTime;
}

main.show();
requestGames(showMenu, main);
