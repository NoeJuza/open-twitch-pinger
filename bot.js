require('dotenv').config();
const { Level } = require('level');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Guild, EmbedBuilder, TextInputStyle,ModalBuilder, ActionRowBuilder, TextInputBuilder, } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages] });

const { ApiClient, Stream } = require('twitch');
const { ClientCredentialsAuthProvider } = require('twitch-auth');
const authProvider  = new ClientCredentialsAuthProvider(process.env.TWITCHID, process.env.TWITCHSECRET);
const twichApiClient = new ApiClient({ authProvider  });
let datas = []

const notifyChans = async (userObj,stream) =>{
    const filtered = datas. filter(chan => 
        chan.streams.some(stream => stream.user.id == userObj.id))
    .map( chan => client.channels.cache.get(chan.chanId))
    .filter(Boolean);
    //filtered.forEach(chan => chan.send("@everyone Ratio"))
    let embed = new EmbedBuilder().setColor('Purple')
                                        .setTitle(`${stream.userDisplayName} - ${stream.title}`)
                                        .setURL(`https://twitch.tv/${stream.userName}`)
                                        .setThumbnail(userObj.profilePictureUrl)
                                        .setDescription(`:red_circle: Streaming: ${stream.gameName},
                                    Stream started: ${stream.startDate.toLocaleString('en')}
                                    For: ${stream.viewers} viewers`)
                                    .setImage(stream.getThumbnailUrl(1600,900));
                                    
    filtered.forEach(chan => chan.send({"content":`:warning: @everyone ${userObj.displayName} is streaming now!!!`,"embeds": [embed]} ))
}
const wave = {name: "wave", type:2}
const infos = new SlashCommandBuilder()
                    .setName('infos')
                    .setDescription("Gives infos about a specified twitch channel")
                    .addStringOption(option =>
                        option.setName("name")
                        .setDescription("Twitch channel's name")
                        .setRequired(true)
                    );
const follow = new SlashCommandBuilder()
                    .setName('follow')
                    .setDescription("Will ping @everyone in the current chan shortly after the specified streamer goes live")
                    .addStringOption(option =>
                        option.setName("name")
                        .setDescription("Twitch channel's name")
                        .setRequired(true)
                    );
const unfollow = new SlashCommandBuilder()
                    .setName('unfollow')
                    .setDescription("reverts the follow command for the specified streamer")
                    .addStringOption(option =>
                        option.setName("name")
                        .setDescription("Twitch channel's name")
                        .setRequired(true)
                    );
const commands = [wave,infos, follow, unfollow]
const rest = new REST({ version: '10' }).setToken(process.env.DISCTOKEN);
const db = new Level('./db', { valueEncoding: 'json' });

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        // The put method is used to fully refresh all commands in the guild with the current set
        const data = await rest.put(
            Routes.applicationCommands(process.env.DISCID),
            { body: commands },
        );
        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
    try {
        const res = await db.get("datas");
        datas = res
    }catch (err){
        if (err.code == 'LEVEL_NOT_FOUND'){
            db.put("datas",[])
            console.log("initialized DB")
            datas = []
        }else{
            console.log(err)
        }
    }
})();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    setInterval(async ()=>{
        const toBeChecked = datas.flatMap(chan => chan.streams);
        //console.log(toBeChecked)
        const nodup = toBeChecked.filter((value, index, self) => index === self.findIndex((t) => (t.user.id === value.user.id)));
        //console.log(nodup)
        nodup.forEach( async (usr) =>{
            //console.log(usr)
            try{
                const user = await(twichApiClient.helix.users.getUserById(usr.user.id))
                const stream = await user.getStream();
                if(stream !== null){
                    if(!(usr.wasLive)){
                        console.log(`Streamer id: ${user.id} was detected up`)
                        usr.wasLive = true;
                        notifyChans(user, stream);
                    }
                }else{
                    usr.wasLive = false;
                }
            }
            catch(err){
                console.log(err)
                console.log("cannot get twitch data wtf because of precedent error")                
            }
        })
        try{
            await db.put("datas",datas);
        }catch(err){
            console.log(`couldn't put the datas in the db because: ${err}`)
        }
    },60000)
});

client.on('messageCreate', async (message) => {
    return false;
});
client.on('interactionCreate', async interaction => {
    if (interaction.commandName == "wave"){
        interaction.reply(`:wave: <@${interaction.targetId}>`);
    }

    if (interaction.commandName == "infos"){
        const userName = interaction.options.get("name").value;
        const user = await twichApiClient.helix.users.getUserByName(userName);
        if (!user) {
            interaction.reply(`User with login: ${userName} does not exist`);
            return false;
        }else{
            const stream = await user.getStream();
            let embed = new EmbedBuilder().setColor('Purple')
                                        .setTitle(user.displayName)
                                        .setURL(`https://twitch.tv/${userName}`)
                                        .setThumbnail(user.profilePictureUrl)
            if(stream !== null){
                embed.setDescription(`ID:${user.id}
                                    Description: ${user.description}
                                    Total number of views: ${user.views}
                                    Channel Creation: ${user.creationDate.toLocaleDateString('en')}
                                    Channel type: ${user.broadcasterType == "" ? "normal" : user.broadcasterType }
                                    :red_circle: Streaming: ${stream.gameName},
                                    Title: ${stream.title}
                                    Stream started: ${stream.startDate.toLocaleString('en')}
                                    For: ${stream.viewers} viewers`)
                    .setImage(stream.thumbnailUrl);
            }else{
                embed.setDescription(`ID:${user.id}
                                    Description: ${user.description}
                                    Total number of views: ${user.views}
                                    Channel type: ${user.broadcasterType == "" ? "normal" : user.broadcasterType }
                                    Channel Creation: ${user.creationDate.toLocaleDateString('en')}
                                    Offline :cry:`);
                const placeholder = user.offlinePlaceholderUrl
                if (placeholder != "" & placeholder != null){
                    embed.setImage(placeholder)
                }
            }
            interaction.reply({embeds: [embed]});
        }
    }

    if (interaction.commandName == "follow"){
        const userName = interaction.options.get("name").value;
        const user = await twichApiClient.helix.users.getUserByName(userName);
        if (!user) {
            interaction.reply(`User with login: ${userName} does not exist`);
            return false;
        }else{
            let channeldataobject =  datas.find(c => c.chanId == interaction.channelId)
            if( channeldataobject !== undefined){
                if(channeldataobject.streams?.find(s => s.user.id == user.id) == undefined){
                    channeldataobject.streams.push({"user": {id: user.id}, "wasLive": false});
                    interaction.reply(`You will now recieve a notification in this channel when ${user.displayName} goes live!`)
                    console.log(`followed ${user.displayName} in channel: ${channeldataobject.chanId}`)
                }else{
                    interaction.reply(`You're already following ${user.displayName} in this channel!`)
                }
            }else{
                datas.push({"chanId": interaction.channelId, "streams" : [{"user": {id: user.id}, "wasLive":false }]})
                interaction.reply(`You will now recieve a notification in this channel when ${user.displayName} goes live!`)
                console.log(`followed ${user.displayName} in channel: ${interaction.channelId}`)
            }
        }
    }

    if (interaction.commandName == "unfollow"){
        const userName = interaction.options.get("name").value;
        const user = await twichApiClient.helix.users.getUserByName(userName);
        if (!user) {
            interaction.reply(`User with login: ${userName} does not exist`);
            return false;
        }else{
            let channeldataobject =  datas.find(c => c.chanId == interaction.channelId)
            if( channeldataobject !== undefined){
                if(channeldataobject.streams?.find(s => s.user.id == user.id) !== undefined){
                    channeldataobject.streams = channeldataobject.streams.filter(s => s.user.id != user.id);
                    interaction.reply(`You will not recieve a notification in this channel when ${user.displayName} goes live anymore!`)
                    console.log(`unfollowed ${user.displayName} in channel: ${channeldataobject.chanId}`)
                }else{
                    interaction.reply(`You're already not following ${user.displayName} in this channel`)
                }
            }else{
                interaction.reply(`You're already not following ${user.displayName} in this channel`)
            }
        }
    }
});
client.login(process.env.DISCTOKEN);