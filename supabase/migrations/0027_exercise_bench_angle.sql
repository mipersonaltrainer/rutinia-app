-- Bench angle (plano / inclinado / declinado) so trainers can pick press, fly and similar variants at a glance.
-- Derived from the exercise name by an editorial rule (also applied to exercises a trainer creates): it is a search aid, not a biomechanical claim.
alter table exercises add column bench_angle text check (bench_angle in ('flat','incline','decline'));
create index on exercises (bench_angle) where bench_angle is not null;

create or replace function exercise_bench_angle(n text) returns text language sql immutable as $$
  select case
    when lower(immutable_unaccent(n)) ~ '(declinad|decline)' then 'decline'
    when lower(immutable_unaccent(n)) ~ '^(remo|caminata|curl arana)' then null                          -- «inclinado» there means torso lean or a treadmill, not a bench
    when lower(immutable_unaccent(n)) ~ '(inclinad|incline)' then 'incline'
    when lower(immutable_unaccent(n)) ~ '(plano|flat|banca)' then 'flat'
    else null end;
$$;

-- Search over the words trainers actually type: the muscle, equipment and pattern are searchable too (so «bíceps» finds every curl, «mancuernas» every dumbbell move).
create or replace function exercise_terms(p_muscle text, p_equipment text, p_pattern text, p_angle text) returns text language sql immutable as $$
  select ' ' || case p_muscle
   when 'chest' then 'Pecho chest pectoral'
   when 'back' then 'Espalda back lats'
   when 'shoulders' then 'Hombros shoulders delts'
   when 'biceps' then 'Bíceps biceps arms'
   when 'triceps' then 'Tríceps triceps arms'
   when 'forearms' then 'Antebrazos '
   when 'quadriceps' then 'Cuádriceps quads legs'
   when 'hamstrings' then 'Isquiotibiales hamstrings legs'
   when 'glutes' then 'Glúteos glutes'
   when 'calves' then 'Pantorrillas calves'
   when 'core' then 'Core abs abdominales abdomen'
   when 'adductors' then 'Aductores '
   when 'abductors' then 'Abductores '
   when 'hip_flexors' then 'Flexores de cadera '
   when 'lower_back' then 'Zona lumbar '
   when 'cardio' then 'Cardio '
   when 'full_body' then 'Cuerpo completo '
   when 'hips' then 'Cadera (movilidad) '
   when 'spine' then 'Columna (movilidad) '
      else '' end || ' ' ||
    case p_equipment
   when 'bodyweight' then 'Peso corporal bodyweight calistenia sin equipo'
   when 'dumbbell' then 'Mancuernas dumbbell mancuerna'
   when 'barbell' then 'Barra barbell barra'
   when 'cable' then 'Polea cable polea'
   when 'machine' then 'Máquina machine maquina'
   when 'kettlebell' then 'Kettlebell kettlebell pesa rusa'
   when 'band' then 'Banda elástica band liga banda'
   when 'suspension' then 'Suspensión (TRX) trx'
   when 'medicine_ball' then 'Balón medicinal '
   when 'plate' then 'Disco '
   when 'cardio_machine' then 'Máquina de cardio '
   when 'other' then 'Otro '
      else '' end || ' ' ||
    case p_pattern
   when 'push_horizontal' then 'Empuje horizontal empuje push'
   when 'push_vertical' then 'Empuje vertical empuje push'
   when 'pull_horizontal' then 'Tirón horizontal tiron pull'
   when 'pull_vertical' then 'Tirón vertical tiron pull jalon'
   when 'squat' then 'Sentadilla squat sentadilla'
   when 'hinge' then 'Bisagra de cadera hinge bisagra peso muerto'
   when 'lunge' then 'Zancada lunge zancada'
   when 'carry' then 'Acarreo '
   when 'isolation' then 'Aislamiento '
   when 'core_flexion' then 'Core: flexión '
   when 'core_stability' then 'Core: estabilidad '
   when 'core_rotation' then 'Core: rotación '
   when 'core_lateral' then 'Core: lateral '
   when 'jump' then 'Salto '
   when 'throw' then 'Lanzamiento '
   when 'locomotion' then 'Locomoción '
   when 'mobility' then 'Movilidad '
   when 'stability' then 'Equilibrio y estabilidad '
      else '' end || ' ' ||
    case p_angle when 'flat' then 'plano plana flat' when 'incline' then 'inclinado inclinada incline' when 'decline' then 'declinado declinada decline' else '' end;
$$;

create or replace function exercises_search_text() returns trigger language plpgsql as $$
begin
  new.bench_angle := exercise_bench_angle(new.name_es);
  new.search_text := lower(immutable_unaccent(new.name_es || ' ' || array_to_string(new.alt_names,' ') || ' ' || array_to_string(new.tags,' ') || exercise_terms(new.primary_muscle::text, new.equipment::text, new.movement_pattern::text, new.bench_angle)));
  return new;
end $$;

update exercises set name_es = name_es;
