#Install packages: reader, tidyverse
library(readr)
library(tidyverse)
library(readxl)
library(sf)
library(ggplot2)

############################################
## This section provided by NYC Open Data for selecting most recent inspection per restaurant
############################################
# Download DOHMH NYC Restaurant Inspection Results data set and save as CSV file:
Open_Data_Sample <- read_csv("CoffeeCity/RestaurantInspections/DOHMH_New_York_City_Restaurant_Inspection_Results_20260221.csv",
                             col_types = cols(ZIPCODE = col_character())
)
#View(Open_Data_Sample)
#Filter on inspection type, score, grade
Inspections <- Open_Data_Sample %>%
  filter((`INSPECTION TYPE` %in%
            c('Cycle Inspection / Re-inspection'
              ,'Pre-permit (Operational) / Re-inspection')
          |(`INSPECTION TYPE` %in%
              c('Cycle Inspection / Initial Inspection'
                ,'Pre-permit (Operational) / Initial Inspection'))
          & SCORE <= 13)
         | (`INSPECTION TYPE` %in%
              c('Pre-permit (Operational) / Reopening Inspection'
                ,'Cycle Inspection / Reopening Inspection'))
         & GRADE %in% c('A', 'B', 'C', 'P', 'Z')) %>%
         select(CAMIS,`INSPECTION DATE`) 

new_restaurants <- Open_Data_Sample %>% 
  filter(`INSPECTION DATE` == "01/01/1900") # New restaurants don't have cuisine descriptions until they are inspected ig
#Select distinct inspections
Inspections_Distinct <- distinct(Inspections)
#Select most recent inspection date
MostRecentInsp <- Inspections_Distinct %>%
  group_by(CAMIS) %>%
  slice(which.max(as.Date(`INSPECTION DATE`,'%m/%d/%Y')))
#Join most recent inspection with original dataset
inner_join(Open_Data_Sample,MostRecentInsp, by = "CAMIS","INSPECTION DATE")
#Select restaurant inspection data based on most recent inspection date
Final <- Open_Data_Sample %>% inner_join(MostRecentInsp) %>%
  filter((`INSPECTION TYPE` %in%
            c('Cycle Inspection / Re-inspection'
              ,'Pre-permit (Operational) / Re-inspection'
              , 'Pre-permit (Operational) / Reopening Inspection'
              ,'Cycle Inspection / Reopening Inspection')
          |(`INSPECTION TYPE` %in%
              c('Cycle Inspection / Initial Inspection'
                ,'Pre-permit (Operational) / Initial Inspection'))
          & SCORE <= 13)) %>%
  rbind(new_restaurants)
  #select(CAMIS,DBA,`INSPECTION DATE`,GRADE,`INSPECTION TYPE`,SCORE)
#Select distinct restaurant inspection data
Final <- distinct(Final)
#View(Final)

###############################################
## End of code from NYC Open Data
###############################################

## Figure 1 Data Prep: Coffee Shop Density

# Filter for coffee ships

coffeeShops <- Final %>% 
  filter(`CUISINE DESCRIPTION` == "Coffee/Tea") %>% 
  filter(!is.na(Location))

coffee_midtown <- coffeeShops %>% 
  filter(NTA == "MN19")

# Data Explorations
# NTAs changed with 2020 census -> need to recalculate
#nta_shape <- st_read("CoffeeCity/nynta2020_25d/nynta2020.shp")
#nta_shape <- st_transform(nta_shape, 4326)

# Join the restuarants to the 
# Sum coffee shops per NTA
coffee_nta <- coffeeShops %>% 
  group_by(NTA) %>% 
  summarise(Total = n(),
            Total_Graded = sum(GRADE %in% c('A', 'B', 'C'), na.rm = TRUE),
            A = sum(GRADE == 'A', na.rm = TRUE)/Total_Graded * 100,
            B = sum(GRADE == 'B', na.rm = TRUE)/Total_Graded * 100,
            C = sum(GRADE == 'C', na.rm = TRUE)/Total_Graded * 100,
            AvgScore = mean(SCORE, na.rm = TRUE)) %>% 
  ungroup() %>% 
  rename(NTACode = NTA)

coffee_nta_ranked <- coffee_nta %>%
  # Rank most columns descending (High value = Rank 1)
  mutate(across(c(Total, Total_Graded, A, B, C), 
                ~min_rank(desc(.x)), 
                .names = "rank_{.col}")) %>%
  # Rank AvgScore ascending (Low value = Rank 1)
  mutate(rank_AvgScore = min_rank(AvgScore)) %>% 
  arrange(rank_AvgScore)

# 2010 Population by NTA
pop <- read_csv("CoffeeCity/nyc_nta_2010_pop/New_York_City_Population_By_Neighborhood_Tabulation_Areas_20260221.csv") %>% 
  rename(NTACode = `NTA Code`) %>% 
  filter(Year == 2010)

coffee_nta_capita <- coffee_nta_ranked %>% 
  left_join(pop, by = "NTACode") %>% 
  mutate(per_capita = if_else(Total != 0 & Population != 0, Total/Population * 10000, NA)) %>% 
  mutate(rank_capita = min_rank(desc(per_capita)))

# Other things can explore:
# Top violation per neighborhood

# Read shape file
shape_file <- st_read("CoffeeCity/nynta2010_25d/nynta2010.shp")

shape_coffee <- left_join(shape_file, coffee_nta_capita, by = "NTACode")

# Proportion of As
ggplot(data = shape_coffee) +
  geom_sf(aes(fill = A)) #+ # Replace 'attribute_name' with a column from your data +
  #guides(fill = "none") 

# Per capita
ggplot(data = shape_coffee) +
  geom_sf(aes(fill = per_capita))

# Violations
ggplot(data = shape_coffee) +
  geom_sf(aes(fill = AvgScore))

coffeeShops_sf <- coffeeShops %>%
  filter(!is.na(Latitude), !is.na(Longitude)) %>%
  st_as_sf(coords = c("Longitude", "Latitude"), crs = 4326)

# Map individual
ggplot() +
  # Draw the NTA boundaries (the background)
  geom_sf(data = shape_coffee, fill = "whitesmoke", color = "lightgrey") +
  # Draw the coffee shops as points
  geom_sf(data = coffeeShops_sf, color = "brown", size = 0.5, alpha = 0.6) +
  # Crop to NYC bounds (helps if there are outlier points in the ocean)
  coord_sf() +
  theme_minimal() 

shape_coffee <- shape_coffee %>% 
  st_transform(4326)

# Save NTA shp file
# st_write(shape_coffee, "CoffeeCity/PreprepData/nyc_nta_2010_coffee.geojson", delete_layer = TRUE)

# Save shop locations
coffee_points_sf <- coffeeShops_sf %>%
  st_transform(4326)

#st_write(coffee_points_sf, "CoffeeCity/PreparedData/nyc_coffee_points.shp", delete_layer = TRUE)
# Need to decide if group by zipcodes or another metric <- census tract might be better (start with zipcode bc census tracts are very specifi)

# Figure 2: Chain vs Indie
chains <- c("starbucks", "blue bottle", "stumptown", "joe coffee", "gregorys", "la colombe", "matto", "dunkin", "blank street", "panera") # To be edited
chain_pattern <- paste(chains, collapse = "|")

coffee_ci <- coffeeShops %>% 
  mutate(
    name = tolower(DBA),
    # use the collapsed pattern string
    chain = str_detect(name, chain_pattern) 
  )

top_15_codes <- coffee_ci %>%
  filter(!is.na(`VIOLATION CODE`)) %>%
  count(`VIOLATION CODE`, sort = TRUE) %>%
  slice_max(n, n = 15) %>%
  pull(`VIOLATION CODE`)

chain_summary <- coffee_ci %>%
  group_by(chain) %>%
  summarise(
    total = n(),
    avgscore = mean(SCORE, na.rm = TRUE),
    total_graded = sum(GRADE %in% c('A', 'B', 'C'), na.rm = TRUE),
    propA = sum(GRADE == 'A', na.rm = TRUE) / total_graded,
    propB = sum(GRADE == 'B', na.rm = TRUE) / total_graded,
    propC = sum(GRADE == 'C', na.rm = TRUE) / total_graded,
    propCritical = sum(`CRITICAL FLAG` == "Critical", na.rm = TRUE) / total,
    .groups = "drop"
  ) %>%
  left_join(
    coffee_ci %>%
      filter(`VIOLATION CODE` %in% top_15_codes) %>%
      group_by(chain, `VIOLATION CODE`) %>%
      summarise(n = n(), .groups = "drop_last") %>%
      mutate(prop = n / sum(n)) %>% 
      select(-n) %>%
      pivot_wider(names_from = `VIOLATION CODE`, 
                  values_from = prop, 
                  names_prefix = "prop_", 
                  values_fill = 0),
    by = "chain"
  )

# Save files
#write_csv(chain_summary, "chain.csv")
#write_csv(violation_lookup, "violations.csv")

print(chain_summary)

violation_lookup <- coffee_ci %>%
  filter(`VIOLATION CODE` %in% top_15_codes) %>%
  group_by(`VIOLATION CODE`) %>%
  summarise(
    description = first(`VIOLATION DESCRIPTION`),
    description = str_squish(description),
    .groups = "drop"
  ) %>%
  arrange(match(`VIOLATION CODE`, top_15_codes))

# Preview results
print(violation_lookup)


#########################################
library(tidyverse)

all_violations_table <- coffee_ci %>%
  filter(!is.na(`VIOLATION CODE`)) %>%
  group_by(chain, `VIOLATION CODE`) %>%
  tally() %>%
  filter(n >= 5) %>% 
  pivot_wider(names_from = `VIOLATION CODE`, values_from = n, values_fill = 0)

v_matrix <- all_violations_table %>% select(-chain) %>% as.matrix()
row.names(v_matrix) <- ifelse(all_violations_table$chain, "Chain", "Independent")

chi_all <- chisq.test(v_matrix)

# Residual > 2: More frequent than expected (Significant)
# Residual < -2: Less frequent than expected (Significant)
sig_violations <- as.data.frame(chi_all$residuals) %>%
  rownames_to_column("ShopType") %>%
  pivot_longer(-ShopType, names_to = "ViolationCode", values_to = "Residual") %>%
  filter(abs(Residual) > 2) %>%
  arrange(desc(abs(Residual)))

sig_violations_final <- sig_violations %>%
  left_join(violation_lookup, by = c("ViolationCode" = "VIOLATION CODE")) %>%
  mutate(Status = if_else(Residual > 0, "More Likely", "Less Likely")) %>%
  select(ShopType, ViolationCode, Status, Residual, description)

print(sig_violations_final)
