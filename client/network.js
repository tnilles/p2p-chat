var RTCNetwork = (function(socket) {
    'use strict';

    // Shims!
    var PeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection,
        SessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription,
        IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
    navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;

    // In a RTCPeerConnection you can either be an offerer or an answerer (type/otherType)
    var type,
        otherType,
        pc,
        channelOpenedCallback = function() {}; // Callback fired when the channel is opened

    // Utilities
    // Generate a unique-ish string
    var id = function() { return (Math.random() * 10000 + 10000 | 0).toString(); };

    // A wrapper to send data to the server
    var send = function(room, key, data) {
        $.post('addRoomInfo', {room: room, key: key, value: data});
    };

    // Wrapper function to receive data from the server
    var recv = function(room, type, cb) {
        $.get('getRoomInfo', {room: room, key: type}, function(data) {
            cb(data);
        });
        socket.on('roomInfoChanged:' + room + ':' + type, function(data) {
            if (data && data.room === room) {
                cb(data.data);
            }
        });
    };

    // Generic error handler
    var errorHandler = function(err) { console.error(err); };

    var RTCNetwork = function() {
        this.linkId;
        this.channel;
        this.channelSubscribers = [];
        this.onMessage = function(e) {};

        // WebRTC connection utilities
        this.initPeerConnection = function() {
            // Options for the PeerConnection
            var server = {
                iceServers: [
                    {url: 'stun:23.21.150.121'},
                    {url: 'stun:stun.l.google.com:19302'},
                    {url: 'turn:numb.viagenie.ca', credential: 'webrtcdemo', username: 'contact%40thierrynilles.com'}
                ]
            };

            var options = {
                optional: []
            };

            // Create the PeerConnection
            pc = new PeerConnection(server, options);
        };

        this.iceCandidatesHandler = function() {
            var that = this;
            pc.onicecandidate = function (e) {
                // Take the first candidate that isn't null
                if (!e.candidate) { return; }
                pc.onicecandidate = null;

                // Request the other peers ICE candidate
                recv(that.linkId, 'candidate:' + otherType, function (candidate) {
                    pc.addIceCandidate(new IceCandidate(JSON.parse(candidate)));
                });

                // Send our ICE candidate
                send(that.linkId, 'candidate:' + type, JSON.stringify(e.candidate));
            };
        };

        this.sdpsHandler = function() {
            var constraints = {},
                that = this;
            if (type === 'offerer') {
                // Offerer creates the data channel
                that.channel = pc.createDataChannel('mychannel', {});

                // Can bind events right away
                that.bindEvents();

                // Create the offer SDP
                pc.createOffer(function (offer) {
                    pc.setLocalDescription(offer);

                    // Send the offer SDP to the signaling server
                    send(that.linkId, 'offer', JSON.stringify(offer));

                    // Wait for an answer SDP from the signaling server
                    recv(that.linkId, 'answer', function (answer) {
                        pc.setRemoteDescription(
                            new SessionDescription(JSON.parse(answer))
                        );
                    });
                }, errorHandler, constraints);
            } else {
                // Answerer must wait for the data channel
                pc.ondatachannel = function (e) {
                    that.channel = e.channel;
                    that.publishChannel();
                    that.bindEvents();
                };

                // Answerer needs to wait for an offer before generating the answer SDP
                recv(that.linkId, 'offer', function (offer) {
                    if (!offer) return;
                    pc.setRemoteDescription(
                        new SessionDescription(JSON.parse(offer))
                    );

                    // Now we can generate our answer SDP
                    pc.createAnswer(function (answer) {
                        pc.setLocalDescription(answer);

                        // Send it to the signaling server
                        send(that.linkId, 'answer', JSON.stringify(answer));
                    }, errorHandler, constraints);
                });
            }
        };

        // Create a full p2p link
        this.setupConnection = function() {
            this.initPeerConnection();
            this.iceCandidatesHandler();
            this.sdpsHandler();
        };

        // Bind the channel events
        this.bindEvents = function() {
            this.channel.onopen = function () {
                console.log("Channel Open");
                if (type === 'offerer') {
                    channelOpenedCallback();
                }
            };
            this.channel.onmessage = this.onMessage;
        };
    };

    RTCNetwork.prototype = {
        getPeerConnection: function() {
            return pc;
        },
        // Set up a peerConnection when taking the offerer role
        connectWith: function(nickname, from, callback) {
            this.linkId = id();
            type = 'offerer';
            otherType = 'answerer';
            this.setupConnection();
            socket.emit('invitepeer', JSON.stringify({peer: nickname, linkId: this.linkId, from: from}));
            channelOpenedCallback = callback;
        },
        // Set up a peerConnection when taking the answerer role
        listen: function(linkId) {
            this.linkId = linkId;
            type = 'answerer';
            otherType = 'offerer';
            this.setupConnection();
        },
        subscribeChannel: function(callback) {
            this.channelSubscribers.push(callback);
        },
        publishChannel: function() {
            var that = this;
            this.channelSubscribers.map(function(callback) {
                callback(that.channel);
            });
        }
    };

    return RTCNetwork;
})(socket);