hindsight (As in 20/20)
=======================
Monitoring, alarms, and the kitchen sink.

Philosophy
==========
Metrics are a time series of measured values. Each sample has a max, min, 
average, a percentile, and a number of measurements associated with it. The 
resolution of metrics should degrade over time, subject to your configuration.
Metrics are not _collected_, but _reported_. New metrics should be accepted 
gracefully, and when metrics cease to be reported, it's as important a signal as
anything and should be treated as such. Interfaces (REST, zeromq, statsd) should
be easily plugged in, and have direct access to the database.

Goals
=====

1. __Easy.__ There are a lot of solutions out there it seems, for scalable
    monitoring. Problem is, I don't want to set up a Hadoop cluster for it. I 
    just want to run something easy and simple, and be on my merry way. When I'm 
    at the point that I need support for monitoring 100M metrics, I figure 
    that's a good problem to have. Users should be able to happen upon 
    `hindsight`, download it, install it and be running a good-enough setup in 
    about 10 minutes.
2. __Moderate Size.__ Just because it's not distributed, doesn't mean it has to 
    be limited. My plan is to be able to support about 1M unique metrics, and I
    hope to support about 10M. To put that into context, that's 1k metrics on
    each of 10k machines.
3. __Hella Fast.__ Downsampling old data should happen in the background, and we
    should never block the road to inserting new data. My goal is for 250k 
    insertions per second, and I hope to be able to hit 1M insertions per 
    second.
4. __Reliable.__ Redundancy is not my first priority, but reliability is. In 
    cases where it does fall over, it shouldn't be more than up-arrow, enter.
5. __Alarms.__ I'm not going to sit around and gawk over a graph very often. The
    times when I want to look at my metrics are when 1) I'm debugging, 2) 
    profiling, or 3) watching a fire burn. I should be able to describe in a 
    simple JavaScript function, the actions to take if a condition is met on a
    metric.

Features
========

1. __Callbacks.__ When new metrics are reported, old metrics deleted, or new 
    data added, you can register callbacks. This is ideal, for when you want to
    have the graph you're looking at actually live update as data's coming in.
2. __Inheritance.__ A metric can have parent metrics. For example, the metric
    `foo/bar/whiz` has a parent `foo/bar`, and a grandparent `foo`. Any data 
    added to it will also automatically be added to its ancestors. So if you
    report metrics like `cluster-cpu/machine-{1,2,3,4}/core-{1,2,3,4}`, then you
    the aggregate view of the machine's CPU usage as `cluster-cpu/machine-1`, or 
    the entire cluster's aggregate CPU usage is `cluster-cpu`. While an average 
    for the entire cluster might not be useful, it does provide a natural 
    heirarchy.
3. __Alarms.__ Alarms can not only be set on individual metrics, but globs of 
    metrics. Let's say you want to know when _any_ machine's free disk space 
    goes below 100GB, then we could set our alarm:
    
        db.if('cluster-disk/*/free', ...);
    
    Initially, this would apply to all existing metrics. But more importantly,
    __as new machines start reporting their disk space, the alarm automatically
    applies to them as well__.
4. __Asychronous.__ Database initialization, flushing out to disk, rotating out
    and downsampling old data. It's all done asynchronously.

Status
======
It's currently passing most of its unit tests (the really important ones anyway)
and I'm now focusing on performance. With about 1-10k metrics, it does _ok_ with
pure JavaScript, but now I'm about to bust out the C++ API for some of the heavy
lifting.

Martin Luther Time
==================
Graphite seems to be a pretty popular tool. After all, who doesn't want to keep 
tabs on their operation? Kelvin said that "if you can not measure it, you can 
not improve it." While it's hard to put my finger on exactly what never sat right with me about graphite, I will do my best to describe them here.

_It's not my intention to slander graphite. In fact, I would enjoy it if someone more well-acquainted with graphite wanted to talk these issues over and correct
any misconceptions that appear here. Clearly many people have gotten a lot of 
mileage out of graphite. I just think we can do better._

1. __Performance is 'good enough.'__ When I read that, I cringed a little bit. 
    Sure, it's widely accepted that premature optimization is the root of all 
    evil, the authors when writing `whisper` and later `ceres` seemed unwilling 
    to try to write something faster. Off hand, I'm unimpressed with the claim 
    of 160k metrics per minute on 2 machines (granted, that's a number from 
    2009, but one that has not aged well).
2. __A lack of comments.__ I initially tried to look at the ceres code base to 
    see where I might fiddle with it and/or see where I might try to make things
    faster, and while the database may be 600 lines of code, I'd much prefer if 
    it were commented.
3. __Events.__ I want events for my database. I'd like it to be extensible and 
    embeddable. By this, I mean, I'd like to write simple callbacks for events 
    like new metrics, deleted metrics, new data added to a particular metric, 
    and most importantly, when metrics meet certain criteria (alarms).
4. __Modular, but not discrete.__ On its face, it seems odd that I'd run three 
    processes for graphite. I appreciate its modular nature, but I think these 
    components should all be living in the same process space.

Design Considerations
=====================
Initially, I was planning on doing much of this work in Python. In the end, I 
decided to use Node.js. The issues that led me to this conclusion:

1. __Evented IO.__ It's a contentious debate in the Python community. My 
    preference would have been to use gevent, but at some point I figured I'd 
    probably want to burrow down into C/C++-land, and using gevent might 
    complicate that. Node.js, on the other hand, has been built essentially from
    the ground up on `libuv`, and has consideration for evented IO at every 
    level.
2. __C/C++ Bindings.__ My love affair with Cython has been over for a while. 
    It's an absolutely wonderful tool 95% of the time, and then it becomes 
    complex, and it's easy into wander into very-sparsely documented territory.
    On the other hand, the Node.js C++ API is very friendly on its own, outside 
    of an intermedia language like Cython.

