#include <bits/stdc++.h>
using namespace std;

int main(int argc, char** argv) {
    long long index = argc > 1 ? atoll(argv[1]) : 1;
    long long seed = argc > 2 ? atoll(argv[2]) : index;
    mt19937_64 rng(seed);
    long long a = (long long)(rng() % 1000000) + index;
    long long b = (long long)(rng() % 1000000) + seed % 1000;
    cout << a << ' ' << b << '\n';
    return 0;
}
