(function(){
let translateObjs = {};
const trans = (...a) => {
    return translateObjs[a[0x0]] = a, '';
};
function regTextVar(a, b) {
    var c = ![];
    return d(b);
    function d(k, l) {
        switch (k['toLowerCase']()) {
        case 'title':
        case 'subtitle':
        case 'photo.title':
        case 'photo.description':
            var m = (function () {
                switch (k['toLowerCase']()) {
                case 'title':
                case 'photo.title':
                    return 'media.label';
                case 'subtitle':
                    return 'media.data.subtitle';
                case 'photo.description':
                    return 'media.data.description';
                }
            }());
            if (m)
                return function () {
                    var r, s, t = (l && l['viewerName'] ? this['getComponentByName'](l['viewerName']) : undefined) || this['getMainViewer']();
                    if (k['toLowerCase']()['startsWith']('photo'))
                        r = this['getByClassName']('PhotoAlbumPlayListItem')['filter'](function (v) {
                            var w = v['get']('player');
                            return w && w['get']('viewerArea') == t;
                        })['map'](function (v) {
                            return v['get']('media')['get']('playList');
                        });
                    else
                        r = this['_getPlayListsWithViewer'](t), s = j['bind'](this, t);
                    if (!c) {
                        for (var u = 0x0; u < r['length']; ++u) {
                            r[u]['bind']('changing', f, this);
                        }
                        c = !![];
                    }
                    return i['call'](this, r, m, s);
                };
            break;
        case 'tour.name':
        case 'tour.description':
            return function () {
                return this['get']('data')['tour']['locManager']['trans'](k);
            };
        default:
            if (k['toLowerCase']()['startsWith']('viewer.')) {
                var n = k['split']('.'), o = n[0x1];
                if (o) {
                    var p = n['slice'](0x2)['join']('.');
                    return d(p, { 'viewerName': o });
                }
            } else {
                if (k['toLowerCase']()['startsWith']('quiz.') && 'Quiz' in TDV) {
                    var q = undefined, m = (function () {
                            switch (k['toLowerCase']()) {
                            case 'quiz.questions.answered':
                                return TDV['Quiz']['PROPERTY']['QUESTIONS_ANSWERED'];
                            case 'quiz.question.count':
                                return TDV['Quiz']['PROPERTY']['QUESTION_COUNT'];
                            case 'quiz.items.found':
                                return TDV['Quiz']['PROPERTY']['ITEMS_FOUND'];
                            case 'quiz.item.count':
                                return TDV['Quiz']['PROPERTY']['ITEM_COUNT'];
                            case 'quiz.score':
                                return TDV['Quiz']['PROPERTY']['SCORE'];
                            case 'quiz.score.total':
                                return TDV['Quiz']['PROPERTY']['TOTAL_SCORE'];
                            case 'quiz.time.remaining':
                                return TDV['Quiz']['PROPERTY']['REMAINING_TIME'];
                            case 'quiz.time.elapsed':
                                return TDV['Quiz']['PROPERTY']['ELAPSED_TIME'];
                            case 'quiz.time.limit':
                                return TDV['Quiz']['PROPERTY']['TIME_LIMIT'];
                            case 'quiz.media.items.found':
                                return TDV['Quiz']['PROPERTY']['PANORAMA_ITEMS_FOUND'];
                            case 'quiz.media.item.count':
                                return TDV['Quiz']['PROPERTY']['PANORAMA_ITEM_COUNT'];
                            case 'quiz.media.questions.answered':
                                return TDV['Quiz']['PROPERTY']['PANORAMA_QUESTIONS_ANSWERED'];
                            case 'quiz.media.question.count':
                                return TDV['Quiz']['PROPERTY']['PANORAMA_QUESTION_COUNT'];
                            case 'quiz.media.score':
                                return TDV['Quiz']['PROPERTY']['PANORAMA_SCORE'];
                            case 'quiz.media.score.total':
                                return TDV['Quiz']['PROPERTY']['PANORAMA_TOTAL_SCORE'];
                            case 'quiz.media.index':
                                return TDV['Quiz']['PROPERTY']['PANORAMA_INDEX'];
                            case 'quiz.media.count':
                                return TDV['Quiz']['PROPERTY']['PANORAMA_COUNT'];
                            case 'quiz.media.visited':
                                return TDV['Quiz']['PROPERTY']['PANORAMA_VISITED_COUNT'];
                            default:
                                var s = /quiz\.([\w_]+)\.(.+)/['exec'](k);
                                if (s) {
                                    q = s[0x1];
                                    switch ('quiz.' + s[0x2]) {
                                    case 'quiz.score':
                                        return TDV['Quiz']['OBJECTIVE_PROPERTY']['SCORE'];
                                    case 'quiz.score.total':
                                        return TDV['Quiz']['OBJECTIVE_PROPERTY']['TOTAL_SCORE'];
                                    case 'quiz.media.items.found':
                                        return TDV['Quiz']['OBJECTIVE_PROPERTY']['PANORAMA_ITEMS_FOUND'];
                                    case 'quiz.media.item.count':
                                        return TDV['Quiz']['OBJECTIVE_PROPERTY']['PANORAMA_ITEM_COUNT'];
                                    case 'quiz.media.questions.answered':
                                        return TDV['Quiz']['OBJECTIVE_PROPERTY']['PANORAMA_QUESTIONS_ANSWERED'];
                                    case 'quiz.media.question.count':
                                        return TDV['Quiz']['OBJECTIVE_PROPERTY']['PANORAMA_QUESTION_COUNT'];
                                    case 'quiz.questions.answered':
                                        return TDV['Quiz']['OBJECTIVE_PROPERTY']['QUESTIONS_ANSWERED'];
                                    case 'quiz.question.count':
                                        return TDV['Quiz']['OBJECTIVE_PROPERTY']['QUESTION_COUNT'];
                                    case 'quiz.items.found':
                                        return TDV['Quiz']['OBJECTIVE_PROPERTY']['ITEMS_FOUND'];
                                    case 'quiz.item.count':
                                        return TDV['Quiz']['OBJECTIVE_PROPERTY']['ITEM_COUNT'];
                                    case 'quiz.media.score':
                                        return TDV['Quiz']['OBJECTIVE_PROPERTY']['PANORAMA_SCORE'];
                                    case 'quiz.media.score.total':
                                        return TDV['Quiz']['OBJECTIVE_PROPERTY']['PANORAMA_TOTAL_SCORE'];
                                    }
                                }
                            }
                        }());
                    if (m)
                        return function () {
                            var r = this['get']('data')['quiz'];
                            if (r) {
                                if (!c) {
                                    if (q != undefined) {
                                        if (q == 'global') {
                                            var s = this['get']('data')['quizConfig'], t = s['objectives'];
                                            for (var u = 0x0, v = t['length']; u < v; ++u) {
                                                r['bind'](TDV['Quiz']['EVENT_OBJECTIVE_PROPERTIES_CHANGE'], h['call'](this, t[u]['id'], m), this);
                                            }
                                        } else
                                            r['bind'](TDV['Quiz']['EVENT_OBJECTIVE_PROPERTIES_CHANGE'], h['call'](this, q, m), this);
                                    } else
                                        r['bind'](TDV['Quiz']['EVENT_PROPERTIES_CHANGE'], g['call'](this, m), this);
                                    c = !![];
                                }
                                try {
                                    var w = 0x0;
                                    if (q != undefined) {
                                        if (q == 'global') {
                                            var s = this['get']('data')['quizConfig'], t = s['objectives'];
                                            for (var u = 0x0, v = t['length']; u < v; ++u) {
                                                w += r['getObjective'](t[u]['id'], m);
                                            }
                                        } else
                                            w = r['getObjective'](q, m);
                                    } else {
                                        w = r['get'](m);
                                        if (m == TDV['Quiz']['PROPERTY']['PANORAMA_INDEX'])
                                            w += 0x1;
                                    }
                                    return w;
                                } catch (x) {
                                    return undefined;
                                }
                            }
                        };
                }
            }
            break;
        }
        return function () {
            return '';
        };
    }
    function e() {
        var k = this['get']('data');
        k['updateText'](k['translateObjs'][a], a['split']('.')[0x0]);
        let l = a['split']('.'), m = l[0x0] + '_vr';
        m in this && k['updateText'](k['translateObjs'][a], m);
    }
    function f(k) {
        var l = k['data']['nextSelectedIndex'];
        if (l >= 0x0) {
            var m = k['source']['get']('items')[l], n = function () {
                    m['unbind']('begin', n, this, !![]), e['call'](this);
                };
            m['bind']('begin', n, this, !![]);
        }
    }
    function g(k) {
        return function (l) {
            k in l && e['call'](this);
        }['bind'](this);
    }
    function h(k, l) {
        return function (m, n) {
            k == m && l in n && e['call'](this);
        }['bind'](this);
    }
    function i(k, l, m) {
        for (var n = 0x0; n < k['length']; ++n) {
            var o = k[n], p = o['get']('selectedIndex');
            if (p >= 0x0) {
                var q = l['split']('.'), r = o['get']('items')[p];
                if (m !== undefined && !m['call'](this, r))
                    continue;
                for (var s = 0x0; s < q['length']; ++s) {
                    if (r == undefined)
                        return '';
                    r = 'get' in r ? r['get'](q[s]) : r[q[s]];
                }
                return r;
            }
        }
        return '';
    }
    function j(k, l) {
        var m = l['get']('player');
        return m !== undefined && m['get']('viewerArea') == k;
    }
}
var script = {"scrollBarColor":"#000000","propagateClick":false,"scripts":{"setMeasurementUnits":TDV.Tour.Script.setMeasurementUnits,"playGlobalAudio":TDV.Tour.Script.playGlobalAudio,"playGlobalAudioWhilePlayActiveMedia":TDV.Tour.Script.playGlobalAudioWhilePlayActiveMedia,"shareSocial":TDV.Tour.Script.shareSocial,"executeAudioActionByTags":TDV.Tour.Script.executeAudioActionByTags,"historyGoForward":TDV.Tour.Script.historyGoForward,"stopGlobalAudios":TDV.Tour.Script.stopGlobalAudios,"openLink":TDV.Tour.Script.openLink,"quizPauseTimer":TDV.Tour.Script.quizPauseTimer,"getOverlays":TDV.Tour.Script.getOverlays,"copyObjRecursively":TDV.Tour.Script.copyObjRecursively,"getActiveMediaWithViewer":TDV.Tour.Script.getActiveMediaWithViewer,"clone":TDV.Tour.Script.clone,"disableVR":TDV.Tour.Script.disableVR,"getOverlaysByTags":TDV.Tour.Script.getOverlaysByTags,"showComponentsWhileMouseOver":TDV.Tour.Script.showComponentsWhileMouseOver,"pauseGlobalAudiosWhilePlayItem":TDV.Tour.Script.pauseGlobalAudiosWhilePlayItem,"pauseGlobalAudios":TDV.Tour.Script.pauseGlobalAudios,"htmlToPlainText":TDV.Tour.Script.htmlToPlainText,"setObjectsVisibility":TDV.Tour.Script.setObjectsVisibility,"getComponentsByTags":TDV.Tour.Script.getComponentsByTags,"setObjectsVisibilityByID":TDV.Tour.Script.setObjectsVisibilityByID,"showPopupMedia":TDV.Tour.Script.showPopupMedia,"getOverlaysByGroupname":TDV.Tour.Script.getOverlaysByGroupname,"cleanSelectedMeasurements":TDV.Tour.Script.cleanSelectedMeasurements,"setMainMediaByIndex":TDV.Tour.Script.setMainMediaByIndex,"stopAndGoCamera":TDV.Tour.Script.stopAndGoCamera,"stopGlobalAudio":TDV.Tour.Script.stopGlobalAudio,"showPopupImage":TDV.Tour.Script.showPopupImage,"getPanoramaOverlayByName":TDV.Tour.Script.getPanoramaOverlayByName,"triggerOverlay":TDV.Tour.Script.triggerOverlay,"quizSetItemFound":TDV.Tour.Script.quizSetItemFound,"executeJS":TDV.Tour.Script.executeJS,"stopTextToSpeech":TDV.Tour.Script.stopTextToSpeech,"getPixels":TDV.Tour.Script.getPixels,"setOverlayBehaviour":TDV.Tour.Script.setOverlayBehaviour,"getActivePlayerWithViewer":TDV.Tour.Script.getActivePlayerWithViewer,"autotriggerAtStart":TDV.Tour.Script.autotriggerAtStart,"initAnalytics":TDV.Tour.Script.initAnalytics,"openEmbeddedPDF":TDV.Tour.Script.openEmbeddedPDF,"setObjectsVisibilityByTags":TDV.Tour.Script.setObjectsVisibilityByTags,"getActivePlayersWithViewer":TDV.Tour.Script.getActivePlayersWithViewer,"quizResumeTimer":TDV.Tour.Script.quizResumeTimer,"getPanoramaOverlaysByTags":TDV.Tour.Script.getPanoramaOverlaysByTags,"toggleVR":TDV.Tour.Script.toggleVR,"getMediaFromPlayer":TDV.Tour.Script.getMediaFromPlayer,"isComponentVisible":TDV.Tour.Script.isComponentVisible,"setMapLocation":TDV.Tour.Script.setMapLocation,"mixObject":TDV.Tour.Script.mixObject,"initOverlayGroupRotationOnClick":TDV.Tour.Script.initOverlayGroupRotationOnClick,"fixTogglePlayPauseButton":TDV.Tour.Script.fixTogglePlayPauseButton,"getKey":TDV.Tour.Script.getKey,"showPopupPanoramaOverlay":TDV.Tour.Script.showPopupPanoramaOverlay,"sendAnalyticsData":TDV.Tour.Script.sendAnalyticsData,"setOverlaysVisibility":TDV.Tour.Script.setOverlaysVisibility,"createTweenModel3D":TDV.Tour.Script.createTweenModel3D,"initQuiz":TDV.Tour.Script.initQuiz,"getAudioByTags":TDV.Tour.Script.getAudioByTags,"cleanAllMeasurements":TDV.Tour.Script.cleanAllMeasurements,"getMediaWidth":TDV.Tour.Script.getMediaWidth,"init":TDV.Tour.Script.init,"quizShowQuestion":TDV.Tour.Script.quizShowQuestion,"toggleMeasurementsVisibility":TDV.Tour.Script.toggleMeasurementsVisibility,"setOverlaysVisibilityByTags":TDV.Tour.Script.setOverlaysVisibilityByTags,"showPopupPanoramaVideoOverlay":TDV.Tour.Script.showPopupPanoramaVideoOverlay,"createTween":TDV.Tour.Script.createTween,"cloneBindings":TDV.Tour.Script.cloneBindings,"quizShowScore":TDV.Tour.Script.quizShowScore,"getCurrentPlayerWithMedia":TDV.Tour.Script.getCurrentPlayerWithMedia,"_initSplitViewer":TDV.Tour.Script._initSplitViewer,"updateIndexGlobalZoomImage":TDV.Tour.Script.updateIndexGlobalZoomImage,"_initTwinsViewer":TDV.Tour.Script._initTwinsViewer,"_getPlayListsWithViewer":TDV.Tour.Script._getPlayListsWithViewer,"copyToClipboard":TDV.Tour.Script.copyToClipboard,"setPanoramaCameraWithCurrentSpot":TDV.Tour.Script.setPanoramaCameraWithCurrentSpot,"setMainMediaByName":TDV.Tour.Script.setMainMediaByName,"pauseCurrentPlayers":TDV.Tour.Script.pauseCurrentPlayers,"setCameraSameSpotAsMedia":TDV.Tour.Script.setCameraSameSpotAsMedia,"showWindow":TDV.Tour.Script.showWindow,"downloadFile":TDV.Tour.Script.downloadFile,"updateMediaLabelFromPlayList":TDV.Tour.Script.updateMediaLabelFromPlayList,"getMediaHeight":TDV.Tour.Script.getMediaHeight,"getPlayListWithItem":TDV.Tour.Script.getPlayListWithItem,"quizShowTimeout":TDV.Tour.Script.quizShowTimeout,"quizStart":TDV.Tour.Script.quizStart,"getCurrentPlayers":TDV.Tour.Script.getCurrentPlayers,"registerKey":TDV.Tour.Script.registerKey,"setComponentVisibility":TDV.Tour.Script.setComponentVisibility,"unloadViewer":TDV.Tour.Script.unloadViewer,"textToSpeechComponent":TDV.Tour.Script.textToSpeechComponent,"setPanoramaCameraWithSpot":TDV.Tour.Script.setPanoramaCameraWithSpot,"getFirstPlayListWithMedia":TDV.Tour.Script.getFirstPlayListWithMedia,"setDirectionalPanoramaAudio":TDV.Tour.Script.setDirectionalPanoramaAudio,"setMediaBehaviour":TDV.Tour.Script.setMediaBehaviour,"getGlobalAudio":TDV.Tour.Script.getGlobalAudio,"playAudioList":TDV.Tour.Script.playAudioList,"executeFunctionWhenChange":TDV.Tour.Script.executeFunctionWhenChange,"setPlayListSelectedIndex":TDV.Tour.Script.setPlayListSelectedIndex,"setMeasurementsVisibility":TDV.Tour.Script.setMeasurementsVisibility,"isCardboardViewMode":TDV.Tour.Script.isCardboardViewMode,"setComponentsVisibilityByTags":TDV.Tour.Script.setComponentsVisibilityByTags,"showWindowBase":TDV.Tour.Script.showWindowBase,"setModel3DCameraSpot":TDV.Tour.Script.setModel3DCameraSpot,"executeAudioAction":TDV.Tour.Script.executeAudioAction,"playGlobalAudioWhilePlay":TDV.Tour.Script.playGlobalAudioWhilePlay,"getPlayListItems":TDV.Tour.Script.getPlayListItems,"quizFinish":TDV.Tour.Script.quizFinish,"getModel3DInnerObject":TDV.Tour.Script.getModel3DInnerObject,"setSurfaceSelectionHotspotMode":TDV.Tour.Script.setSurfaceSelectionHotspotMode,"isPanorama":TDV.Tour.Script.isPanorama,"syncPlaylists":TDV.Tour.Script.syncPlaylists,"updateVideoCues":TDV.Tour.Script.updateVideoCues,"startModel3DWithCameraSpot":TDV.Tour.Script.startModel3DWithCameraSpot,"toggleTextToSpeechComponent":TDV.Tour.Script.toggleTextToSpeechComponent,"assignObjRecursively":TDV.Tour.Script.assignObjRecursively,"getPlayListItemByMedia":TDV.Tour.Script.getPlayListItemByMedia,"clonePanoramaCamera":TDV.Tour.Script.clonePanoramaCamera,"unregisterKey":TDV.Tour.Script.unregisterKey,"getMainViewer":TDV.Tour.Script.getMainViewer,"startPanoramaWithCamera":TDV.Tour.Script.startPanoramaWithCamera,"setStartTimeVideo":TDV.Tour.Script.setStartTimeVideo,"keepCompVisible":TDV.Tour.Script.keepCompVisible,"getPlayListItemIndexByMedia":TDV.Tour.Script.getPlayListItemIndexByMedia,"changeOpacityWhilePlay":TDV.Tour.Script.changeOpacityWhilePlay,"takeScreenshot":TDV.Tour.Script.takeScreenshot,"startPanoramaWithModel":TDV.Tour.Script.startPanoramaWithModel,"getMediaByName":TDV.Tour.Script.getMediaByName,"pauseGlobalAudio":TDV.Tour.Script.pauseGlobalAudio,"setStartTimeVideoSync":TDV.Tour.Script.setStartTimeVideoSync,"setModel3DCameraWithCurrentSpot":TDV.Tour.Script.setModel3DCameraWithCurrentSpot,"skip3DTransitionOnce":TDV.Tour.Script.skip3DTransitionOnce,"resumePlayers":TDV.Tour.Script.resumePlayers,"textToSpeech":TDV.Tour.Script.textToSpeech,"_getObjectsByTags":TDV.Tour.Script._getObjectsByTags,"restartTourWithoutInteraction":TDV.Tour.Script.restartTourWithoutInteraction,"updateDeepLink":TDV.Tour.Script.updateDeepLink,"visibleComponentsIfPlayerFlagEnabled":TDV.Tour.Script.visibleComponentsIfPlayerFlagEnabled,"setValue":TDV.Tour.Script.setValue,"_initItemWithComps":TDV.Tour.Script._initItemWithComps,"changeBackgroundWhilePlay":TDV.Tour.Script.changeBackgroundWhilePlay,"existsKey":TDV.Tour.Script.existsKey,"getComponentByName":TDV.Tour.Script.getComponentByName,"getRootOverlay":TDV.Tour.Script.getRootOverlay,"toggleMeasurement":TDV.Tour.Script.toggleMeasurement,"getQuizTotalObjectiveProperty":TDV.Tour.Script.getQuizTotalObjectiveProperty,"translate":TDV.Tour.Script.translate,"setModel3DCameraSequence":TDV.Tour.Script.setModel3DCameraSequence,"getMediaByTags":TDV.Tour.Script.getMediaByTags,"startMeasurement":TDV.Tour.Script.startMeasurement,"stopMeasurement":TDV.Tour.Script.stopMeasurement,"changePlayListWithSameSpot":TDV.Tour.Script.changePlayListWithSameSpot,"getStateTextToSpeech":TDV.Tour.Script.getStateTextToSpeech,"resumeGlobalAudios":TDV.Tour.Script.resumeGlobalAudios,"getPlayListsWithMedia":TDV.Tour.Script.getPlayListsWithMedia,"enableVR":TDV.Tour.Script.enableVR,"loadFromCurrentMediaPlayList":TDV.Tour.Script.loadFromCurrentMediaPlayList,"setLocale":TDV.Tour.Script.setLocale,"_initTTSTooltips":TDV.Tour.Script._initTTSTooltips,"historyGoBack":TDV.Tour.Script.historyGoBack,"setEndToItemIndex":TDV.Tour.Script.setEndToItemIndex},"minHeight":0,"minWidth":0,"id":"rootPlayer","start":"this.init()","data":{"history":{},"textToSpeechConfig":{"pitch":1,"speechOnInfoWindow":false,"speechOnQuizQuestion":false,"volume":1,"speechOnTooltip":false,"stopBackgroundAudio":false,"rate":1},"displayTooltipInTouchScreens":true,"locales":{"es":"locale/es.txt"},"name":"Player7762","defaultLocale":"es"},"hash": "890a49256a82755def9856fb7fbe9798d40c6e85c029ecffdaee7bd25442fd57", "definitions": [{"thumbnailUrl":"media/panorama_3212F302_1267_AD3E_41A2_D60E15293A82_t.webp","class":"Panorama","data":{"label":"sala-5-mesas"},"hfov":360,"hfovMin":"150%","id":"panorama_3212F302_1267_AD3E_41A2_D60E15293A82","hfovMax":130,"frames":[{"thumbnailUrl":"media/panorama_3212F302_1267_AD3E_41A2_D60E15293A82_t.webp","cube":{"class":"ImageResource","levels":[{"height":1536,"url":"media/panorama_3212F302_1267_AD3E_41A2_D60E15293A82_0/{face}/0/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":18,"width":9216,"rowCount":3,"tags":"ondemand"},{"height":1024,"url":"media/panorama_3212F302_1267_AD3E_41A2_D60E15293A82_0/{face}/1/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":12,"width":6144,"rowCount":2,"tags":"ondemand"},{"height":512,"url":"media/panorama_3212F302_1267_AD3E_41A2_D60E15293A82_0/{face}/2/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":6,"width":3072,"rowCount":1,"tags":["ondemand","preload"]}]},"class":"CubicPanoramaFrame"}],"vfov":180,"label":trans('panorama_3212F302_1267_AD3E_41A2_D60E15293A82.label')},{"thumbnailUrl":"media/panorama_3213DFE2_1267_B4FE_4186_6570B96F4684_t.webp","class":"Panorama","data":{"label":"sala-4-lounge"},"hfov":360,"hfovMin":"150%","id":"panorama_3213DFE2_1267_B4FE_4186_6570B96F4684","hfovMax":130,"frames":[{"thumbnailUrl":"media/panorama_3213DFE2_1267_B4FE_4186_6570B96F4684_t.webp","cube":{"class":"ImageResource","levels":[{"height":1536,"url":"media/panorama_3213DFE2_1267_B4FE_4186_6570B96F4684_0/{face}/0/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":18,"width":9216,"rowCount":3,"tags":"ondemand"},{"height":1024,"url":"media/panorama_3213DFE2_1267_B4FE_4186_6570B96F4684_0/{face}/1/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":12,"width":6144,"rowCount":2,"tags":"ondemand"},{"height":512,"url":"media/panorama_3213DFE2_1267_B4FE_4186_6570B96F4684_0/{face}/2/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":6,"width":3072,"rowCount":1,"tags":["ondemand","preload"]}]},"class":"CubicPanoramaFrame"}],"vfov":180,"label":trans('panorama_3213DFE2_1267_B4FE_4186_6570B96F4684.label')},{"class":"PanoramaCamera","id":"panorama_3212F302_1267_AD3E_41A2_D60E15293A82_camera","enterPointingToHorizon":true,"initialPosition":{"pitch":0,"class":"PanoramaCameraPosition","yaw":0}},{"class":"PanoramaCamera","id":"panorama_32273933_1267_BD5F_41B3_5409BAB1F4CB_camera","enterPointingToHorizon":true,"initialPosition":{"pitch":0,"class":"PanoramaCameraPosition","yaw":0}},{"thumbnailUrl":"media/panorama_3212DC5F_1267_BBC6_41B0_8EA75DE68BC6_t.webp","class":"Panorama","data":{"label":"sala-3-living"},"hfov":360,"hfovMin":"150%","id":"panorama_3212DC5F_1267_BBC6_41B0_8EA75DE68BC6","hfovMax":130,"frames":[{"thumbnailUrl":"media/panorama_3212DC5F_1267_BBC6_41B0_8EA75DE68BC6_t.webp","cube":{"class":"ImageResource","levels":[{"height":1536,"url":"media/panorama_3212DC5F_1267_BBC6_41B0_8EA75DE68BC6_0/{face}/0/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":18,"width":9216,"rowCount":3,"tags":"ondemand"},{"height":1024,"url":"media/panorama_3212DC5F_1267_BBC6_41B0_8EA75DE68BC6_0/{face}/1/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":12,"width":6144,"rowCount":2,"tags":"ondemand"},{"height":512,"url":"media/panorama_3212DC5F_1267_BBC6_41B0_8EA75DE68BC6_0/{face}/2/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":6,"width":3072,"rowCount":1,"tags":["ondemand","preload"]}]},"class":"CubicPanoramaFrame"}],"vfov":180,"label":trans('panorama_3212DC5F_1267_BBC6_41B0_8EA75DE68BC6.label')},{"class":"PanoramaCamera","id":"panorama_3212DC5F_1267_BBC6_41B0_8EA75DE68BC6_camera","enterPointingToHorizon":true,"initialPosition":{"pitch":0,"class":"PanoramaCameraPosition","yaw":0}},{"playbackBarBorderRadius":0,"progressBorderColor":"#000000","playbackBarProgressBorderColor":"#000000","propagateClick":false,"subtitlesGap":0,"toolTipPaddingTop":4,"progressBarBackgroundColor":["#3399FF"],"subtitlesBackgroundColor":"#000000","progressBackgroundColor":["#000000"],"surfaceReticleColor":"#FFFFFF","playbackBarHeadBorderRadius":0,"playbackBarHeadBorderColor":"#000000","playbackBarBackgroundOpacity":1,"vrPointerSelectionColor":"#FF6600","progressBottom":10,"progressHeight":2,"progressBorderSize":0,"playbackBarHeadShadowBlurRadius":3,"data":{"name":"Main Viewer"},"playbackBarBorderSize":0,"toolTipBorderColor":"#767676","surfaceReticleSelectionColor":"#FFFFFF","toolTipBackgroundColor":"#F6F6F6","playbackBarLeft":0,"progressBarBorderSize":0,"progressBarBorderRadius":2,"subtitlesTextShadowOpacity":1,"subtitlesTop":0,"vrPointerSelectionTime":2000,"playbackBarHeadShadowHorizontalLength":0,"subtitlesFontColor":"#FFFFFF","playbackBarHeadHeight":15,"subtitlesTextShadowColor":"#000000","toolTipPaddingBottom":4,"progressBorderRadius":2,"progressLeft":"33%","playbackBarHeadShadowColor":"#000000","playbackBarHeadBorderSize":0,"playbackBarHeadBackgroundColorRatios":[0,1],"playbackBarHeadShadow":true,"subtitlesFontSize":"3vmin","playbackBarHeadShadowVerticalLength":0,"toolTipFontColor":"#606060","toolTipTextShadowColor":"#000000","vrThumbstickRotationStep":20,"minHeight":50,"minWidth":100,"playbackBarHeadBackgroundColor":["#111111","#666666"],"toolTipPaddingRight":6,"id":"MainViewer","playbackBarBottom":5,"toolTipFontFamily":"Arial","toolTipPaddingLeft":6,"firstTransitionDuration":0,"subtitlesBottom":50,"playbackBarBackgroundColor":["#FFFFFF"],"playbackBarHeight":10,"subtitlesTextShadowHorizontalLength":1,"toolTipShadowColor":"#333138","playbackBarProgressBorderSize":0,"playbackBarHeadWidth":6,"playbackBarBackgroundColorDirection":"vertical","subtitlesBackgroundOpacity":0.2,"subtitlesBorderColor":"#FFFFFF","class":"ViewerArea","playbackBarProgressBorderRadius":0,"playbackBarRight":0,"playbackBarProgressBackgroundColor":["#3399FF"],"subtitlesTextShadowVerticalLength":1,"progressBackgroundColorRatios":[0],"vrPointerColor":"#FFFFFF","toolTipFontSize":"1.11vmin","playbackBarHeadShadowOpacity":0.7,"progressRight":"33%","progressOpacity":0.7,"subtitlesFontFamily":"Arial","progressBarBackgroundColorDirection":"horizontal","height":"100%","width":"100%","playbackBarProgressBackgroundColorRatios":[0],"playbackBarBorderColor":"#FFFFFF","progressBarBackgroundColorRatios":[0],"progressBarBorderColor":"#000000"},{"thumbnailUrl":"media/panorama_35D315B3_1267_B55F_41AB_45275AB3D9B6_t.webp","class":"Panorama","data":{"label":"sala-1-entrada"},"hfov":360,"hfovMin":"150%","id":"panorama_35D315B3_1267_B55F_41AB_45275AB3D9B6","hfovMax":130,"frames":[{"thumbnailUrl":"media/panorama_35D315B3_1267_B55F_41AB_45275AB3D9B6_t.webp","cube":{"class":"ImageResource","levels":[{"height":1536,"url":"media/panorama_35D315B3_1267_B55F_41AB_45275AB3D9B6_0/{face}/0/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":18,"width":9216,"rowCount":3,"tags":"ondemand"},{"height":1024,"url":"media/panorama_35D315B3_1267_B55F_41AB_45275AB3D9B6_0/{face}/1/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":12,"width":6144,"rowCount":2,"tags":"ondemand"},{"height":512,"url":"media/panorama_35D315B3_1267_B55F_41AB_45275AB3D9B6_0/{face}/2/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":6,"width":3072,"rowCount":1,"tags":["ondemand","preload"]}]},"class":"CubicPanoramaFrame"}],"vfov":180,"label":trans('panorama_35D315B3_1267_B55F_41AB_45275AB3D9B6.label')},{"class":"PanoramaCamera","id":"panorama_35D315B3_1267_B55F_41AB_45275AB3D9B6_camera","enterPointingToHorizon":true,"initialPosition":{"pitch":0,"class":"PanoramaCameraPosition","yaw":0}},{"id":"mainPlayList","items":[{"camera":"this.panorama_35D315B3_1267_B55F_41AB_45275AB3D9B6_camera","media":"this.panorama_35D315B3_1267_B55F_41AB_45275AB3D9B6","class":"PanoramaPlayListItem","player":"this.MainViewerPanoramaPlayer","begin":"this.setEndToItemIndex(this.mainPlayList, 0, 1)"},{"camera":"this.panorama_32273933_1267_BD5F_41B3_5409BAB1F4CB_camera","media":"this.panorama_32273933_1267_BD5F_41B3_5409BAB1F4CB","class":"PanoramaPlayListItem","player":"this.MainViewerPanoramaPlayer","begin":"this.setEndToItemIndex(this.mainPlayList, 1, 2)"},{"camera":"this.panorama_3212DC5F_1267_BBC6_41B0_8EA75DE68BC6_camera","media":"this.panorama_3212DC5F_1267_BBC6_41B0_8EA75DE68BC6","class":"PanoramaPlayListItem","player":"this.MainViewerPanoramaPlayer","begin":"this.setEndToItemIndex(this.mainPlayList, 2, 3)"},{"camera":"this.panorama_3213DFE2_1267_B4FE_4186_6570B96F4684_camera","media":"this.panorama_3213DFE2_1267_B4FE_4186_6570B96F4684","class":"PanoramaPlayListItem","player":"this.MainViewerPanoramaPlayer","begin":"this.setEndToItemIndex(this.mainPlayList, 3, 4)"},{"camera":"this.panorama_3212F302_1267_AD3E_41A2_D60E15293A82_camera","media":"this.panorama_3212F302_1267_AD3E_41A2_D60E15293A82","class":"PanoramaPlayListItem","end":"this.trigger('tourEnded')","player":"this.MainViewerPanoramaPlayer","begin":"this.setEndToItemIndex(this.mainPlayList, 4, 0)"}],"class":"PlayList"},{"class":"PanoramaCamera","id":"panorama_3213DFE2_1267_B4FE_4186_6570B96F4684_camera","enterPointingToHorizon":true,"initialPosition":{"pitch":0,"class":"PanoramaCameraPosition","yaw":0}},{"thumbnailUrl":"media/panorama_32273933_1267_BD5F_41B3_5409BAB1F4CB_t.webp","class":"Panorama","data":{"label":"sala-2-vitrinas"},"hfov":360,"hfovMin":"150%","id":"panorama_32273933_1267_BD5F_41B3_5409BAB1F4CB","hfovMax":130,"frames":[{"thumbnailUrl":"media/panorama_32273933_1267_BD5F_41B3_5409BAB1F4CB_t.webp","cube":{"class":"ImageResource","levels":[{"height":1536,"url":"media/panorama_32273933_1267_BD5F_41B3_5409BAB1F4CB_0/{face}/0/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":18,"width":9216,"rowCount":3,"tags":"ondemand"},{"height":1024,"url":"media/panorama_32273933_1267_BD5F_41B3_5409BAB1F4CB_0/{face}/1/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":12,"width":6144,"rowCount":2,"tags":"ondemand"},{"height":512,"url":"media/panorama_32273933_1267_BD5F_41B3_5409BAB1F4CB_0/{face}/2/{row}_{column}.webp","class":"TiledImageResourceLevel","colCount":6,"width":3072,"rowCount":1,"tags":["ondemand","preload"]}]},"class":"CubicPanoramaFrame"}],"vfov":180,"label":trans('panorama_32273933_1267_BD5F_41B3_5409BAB1F4CB.label')},{"id":"MainViewerPanoramaPlayer","arrowKeysAction":"translate","class":"PanoramaPlayer","keepModel3DLoadedWithoutLocation":true,"touchControlMode":"drag_rotation","mouseControlMode":"drag_rotation","viewerArea":"this.MainViewer","displayPlaybackBar":true,"aaEnabled":true}],"scrollBarMargin":2,"class":"Player","backgroundColorRatios":[0],"backgroundColor":["#FFFFFF"],"xrPanelsEnabled":true,"defaultMenu":["fullscreen","mute","rotation"],"layout":"absolute","gap":10,"width":"100%","children":["this.MainViewer"],"height":"100%"};
if (script['data'] == undefined)
    script['data'] = {};
script['data']['translateObjs'] = translateObjs, script['data']['createQuizConfig'] = function () {
    let a = {}, b = this['get']('data')['translateObjs'];
    for (const c in translateObjs) {
        if (!b['hasOwnProperty'](c))
            b[c] = translateObjs[c];
    }
    return a;
}, TDV['PlayerAPI']['defineScript'](script);
//# sourceMappingURL=script_device.js.map
})();
//Generated with v2026.1.0, Tue Aug 18 2026